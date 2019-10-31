import {
  Coin,
  KeyRing,
  MTX,
  Network,
  Script,
  ScriptNum,
  Stack,
} from 'bcoin';
import bcoin from 'bcoin';
import { WalletClient, NodeClient } from 'bclient';
import fs from 'fs';
import ipfsClient from 'ipfs-http-client';
import multihashes from 'multihashes';
import * as ledgerUtil from './ledgerUtil';
import assert from 'assert';
import { PassThrough } from 'stream';
import { parse } from 'path';
import { networkInterfaces } from 'os';

export const setupBcoin = (network, rpcHost, walletHost, apiKey) => {
  const clientOptions = {
    host: rpcHost,
    network: network.type,
    port: network.rpcPort,
    apiKey: apiKey,
  }

  const walletOptions = {
    host: walletHost,
    network: network.type,
    port: network.walletPort,
    apiKey: apiKey,
  }

  const nodeClient = new NodeClient(clientOptions);
  const walletClient = new WalletClient(walletOptions);

  return { nodeClient, walletClient };
}

/**
 * @param {String} locktime - Time that the script can not be redeemed before
 * @param {Buffer} public key hash
 * @returns {Script}
**/
function createScript(locktime, publicKeyHash) {
  let pkh;
  if (typeof publicKeyHash === 'string')
    pkh = Buffer.from(publicKeyHash);
  else pkh = publicKeyHash;
  assert(Buffer.isBuffer(pkh), 'publicKey must be a Buffer');
  assert(
    locktime,
    'Must pass in a locktime argument, either block height or UNIX epoch time'
  );

  const script = new Script();
  // lock the transactions until
  // the locktime has been reached
  script.pushNum(ScriptNum.fromString(locktime.toString(), 10));
  // check the locktime
  script.pushSym('CHECKLOCKTIMEVERIFY');
  // if verifies, drop time from the stack
  script.pushSym('drop');
  // duplicate item on the top of the stack
  // which should be.the public key
  script.pushSym('dup');
  // hash the top item from the stack (the public key)
  script.pushSym('hash160')
  // push the hash to the top of the stack
  script.pushData(pkh);
  // confirm they match
  script.pushSym('equalverify');
  // confirm the signature matches
  script.pushSym('checksig');
  // Compile the script to its binary representation
  // (you must do this if you change something!).
  script.compile();
  return script;
}

/**
 * @param {Script} script to get corresponding address for
 * @param {Network} to determine encoding based on network
 * @returns {Address} - p2wsh segwit address for specified network
**/
export const getAddress = (script, network) => {
  // get the hash of the script
  // and derive address from that
  const p2wsh = script.forWitness();
  const segwitAddress = p2wsh.getAddress().toBech32(network);
  return segwitAddress;
}

/**
 * script the inputs w/ our custom script for an mtx
 * This is modeled after the scriptInput method on
 * the `MTX` class
 * @param {MTX} mtx with unscripted input
 * @param {Number} index - index of input to script
 * @param {Coin} coin- UTXO we are spending
 * @param {KeyRing} ring - keyring we are signing with
 */
export const scriptInput = (mtx, index, coin, ring) => {
  const input = mtx.inputs[index];
  const prev = coin.script;
  const wsh = prev.getWitnessScripthash();
  assert(ring instanceof KeyRing, 'Must pass a KeyRing to scriptInput');
  // this is the redeem script used to verify the p2wsh hash
  const wredeem = ring.getRedeem(wsh);

  assert(wredeem, 'keyring has no redeem script');

  const vector = new Stack();

  // first add empty space in stack for signature and public key
  vector.pushInt(0);
  vector.pushInt(0);

  // add the raw redeem script to the stack
  vector.push(wredeem.toRaw());
  input.witness.fromStack(vector);
  mtx.inputs[index] = input;
  return mtx;
}

/**
 * This is modeled after the signInput method on
 * the `MTX` class
 * @param     {MTX}     mtx     with unscripted input
 * @param     {Number}  index   index of input to script
 * @param     {Coin}    coin    UTXO we are spending
 * @param     {KeyRing} ring    keyring we are signing with
 * @returns   {MTX}
*/
export const signInput = (mtx, index, coin, ring) => {
  const input = mtx.inputs[index];
  let witness, version;

  const redeem = input.witness.getRedeem();

  assert(
    redeem,
    'Witness has not been templated'
  );

  witness = input.witness;
  // version is for the signing to indicate signature hash version
  // 0=legacy, 1=segwit
  version = 1;

  const stack = witness.toStack();
  // let's get the signature and replace the placeholder
  // in the stack. We can use the MTX `signature` method
  const sig = mtx.signature(index, redeem, coin.value, ring.privateKey, null, version);
  stack.setData(0, sig);

  stack.setData(1, ring.getPublicKey());
  witness.fromStack(stack);
  return mtx;
}

export const getNetworkSetting = (network) => {
  switch (network) {
    case 'regtest':
      return Network.get('regtest');
    case 'testnet':
      return Network.get('testnet');
    case 'main':
      return Network.get('main');
    default:
      console.log('No network provided, using regtest');
      return Network.get('regtest');
  }
}

export const getKeyringAndRedeem = async (wallet, nodeClient, network, amountToFund, account) => {
  let rInfo;
  let { balance } = await wallet.getInfo();
  const { address, publicKey } = await wallet.createAddress(account);
  // For testing only, if the account is not funded yet
  if (balance.confirmed <= amountToFund.toValue() && network.type === 'regtest') {
    // Fund the account by generating blocks
    const blockHashes = await nodeClient.execute('generatetoaddress', [ 101, address ]);
    const result = await wallet.getInfo();
    balance = result.balance;
  }
  // Assert the account has necessary balance
  assert(balance.confirmed > amountToFund.toValue(), 'Not enough funds!');
  // create the keyring from the public key and get the public key hash for the locking script
  const keyring = KeyRing.fromKey(Buffer.from(publicKey, 'hex'), true);
  keyring.witness = true;
  // return the pkh, redeemAddress to be input into the lock script
  return { keyring, redeemAddress: address };
}

export const lock = async (
  multiAddr,
  supernovaAddress,
  amountToFund,
  network,
  nodeClient,
  wallet,
  account,
  usingLedger,
  ledgerBcoin,
  debug: Number = 0,
) => {
  const txInfoPath = './tx-info.json'; // this is where we'll persist our info
  // init variables
  let redeemScript, lockingAddr, lockedTx;
  // check if file exists and if there is info saved to it
  let txInfo = fs.existsSync(txInfoPath) ? fs.readFileSync(txInfoPath) : '';
  if (!txInfo.length) {
    // No saved transaction, so let's create it and then save the information for later
    if (debug === 1) console.log('No TX found, creating a new CLTV tx');
    // Grab necessary data from ledger or pull in wallet from wallet ID
    const { keyring, redeemAddress } = await getKeyringAndRedeem(wallet, nodeClient, network, amountToFund, account);
    // Get current height and set locktime to 10 blocks from now
    const { chain: { height }} = await nodeClient.getInfo();
    // For mainnet, we do 6 month lock (10 min/block * 6 blocks/hour * 24 hr/day * 182 days/year)
    const locktime = (network.type === 'regtest') ? height + 10 : height + (10 * 6 * 24 * 182)
    // create the script and address that can be redeemed by our wallet
    const publicKeyHash = keyring.getKeyHash();
    redeemScript = createScript(locktime.toString(), publicKeyHash);
    lockingAddr = getAddress(redeemScript, network);
    // add data to IPFS for later querying
    let ipfsData = { supernovaAddress, lockingAddr, redeemScript, locktime, redeemAddress, publicKeyHash, lockedTx };
    const ipfs = ipfsClient(multiAddr);
    let results = await ipfs.add(Buffer.from(JSON.stringify(ipfsData)));
    let buf = Buffer.from(results[0].path);
    // create funding output and OP_RETURN output with IPFS hash
    let nullScript = bcoin.Script.fromNulldata(buf)
    let nullOutput = bcoin.Output.fromScript(nullScript, 0);
    const lockFundingOutput = { value: amountToFund.toValue(), address: lockingAddr };
    let outputs = [nullOutput, lockFundingOutput];
    // get locked tx
    if (usingLedger) {
      if (debug === 1) console.log(`Using the ledger wallet with id ${wallet.id}, account ${account}`);
      lockedTx = await ledgerUtil.sendTxUsingLedger(ledgerBcoin, wallet, outputs, account, amountToFund, keyring);
    } else {
      if (debug === 1) console.log(`Using the local wallet with id ${wallet.id}, account ${account}`);
      lockedTx = await wallet.createTX({ outputs, rate: 7000 });
      // create new IPFS obj linked to previous with lockedTX data
      ipfsData = Object.assign({}, ipfsData, { prevLink: buf.toString(), prevTx: lockedTx });
      const results = await ipfs.add(Buffer.from(JSON.stringify(ipfsData)));
      buf = Buffer.from(results[0].path);
      nullScript = bcoin.Script.fromNulldata(buf)
      nullOutput = bcoin.Output.fromScript(nullScript, 0);
      outputs = [nullOutput, lockFundingOutput];
      lockedTx = await wallet.send({ outputs, rate: 7000 });
      ipfsData = Object.assign({}, ipfsData, { ipfsHash: buf.toString(), lockedTx: lockedTx });
    }
    if (debug === 1) console.log('transaction sent to mempool');
    // save the transaction information to to a file
    fs.writeFileSync(txInfoPath, JSON.stringify(ipfsData, null, 2));
    return ipfsData;
  } else {
    throw new Error('There already exists a lock tx, save and rename it to start again, otherwise delete it');
  }
}

export const redeem = async (
  network,
  nodeClient,
  wallet,
  debug: Number = 0,
) => {
  const txInfoPath = './tx-info.json'; // this is where we'll persist our info
  // check if file exists and if there is info saved to it
  let txInfo = fs.existsSync(txInfoPath) ? fs.readFileSync(txInfoPath) : '';
  if (txInfo.length > 0) {
    // Grab tx info if it exists
    const { lockedTx, lockingAddr, redeemScript, locktime, redeemAddress } = JSON.parse(txInfo.toString());
    // Get the current height to check that one can redeem
    const { chain: { height }} = await nodeClient.getInfo();
    assert(locktime <= height, `Too soon to redeem the UTXO. Wait until block ${locktime}`);
    // Get the index of the UTXO
    const index = lockedTx.outputs.findIndex(
      output => output.address === lockingAddr
    );
    // Get the coin associated with our locked tx indicating the index of the UTXO
    const coinJSON = await nodeClient.getCoin(lockedTx.hash, index);
    // create a new coin object that references the UTXO we want to spend
    // and add it as an input to a blank mutable transaction
    const coin = Coin.fromJSON(coinJSON);
    let mtx = new MTX();
    mtx.addCoin(coin);
    let outputAddr, keyring;
    // Get an address to redeem funds to
    const { address } = await wallet.createAddress('default');
    outputAddr = address;
    // Next we'll get the private key associated with the pkh
    // that the timelocked UTXO is locked to
    // Note it's generally not safe to transfer your private key
    // unencrypted over the network like this, but we're doing it
    // here for simplicity
    const { privateKey } = await wallet.getWIF(redeemAddress);
    keyring = KeyRing.fromSecret(privateKey, network);
    // Send to the address the value of the coin minus the fee
    mtx.addOutput(outputAddr, coin.value - 1500);
    // set nLocktime field on transaction
    // mempool and chain will check against this
    // to verify finality for each input
    mtx.setLocktime(height);
    // 3) Setup a keyring to use for signing the input
    // First get the script from our saved tx info
    const script = Script.fromRaw(redeemScript, 'hex');
    keyring.witness = true;
    keyring.script= script;
    // 4) Script and sign the input
    // Note that we can use the same methods as in the mock transaction
    mtx = scriptInput(mtx, 0, coin, keyring);
    mtx = signInput(mtx, 0, coin, keyring);
    // 5) Verify and broadcast the tx
    // Note that the `verify` won't check against current height
    // of the blockchain and the node won't reject the tx but will
    // still try and broadcast (you can check your node logs for
    // mempool verification errors)
    if (debug) console.log(`TX check: ${mtx.check()}`);
    assert(mtx.verify(), 'MTX did not verify');
    const tx = mtx.toTX();
    assert(tx.verify(mtx.view), 'TX did not verify');
    const raw = tx.toRaw().toString('hex');
    // Broadcast raw tx to the network
    const result = await nodeClient.broadcast(raw);
    assert(result.success, 'There was a problem broadcasting the tx');
    // confirm the tx is in the mempool
    // we need to do this because even if the mempool says there is a problem
    // with your transaction, it will try and broadcast anyway
    // and result will come back with `success: true`. If it made it into the
    // mempool and/or chain and can be queried then you know it was successful
    const txFromHash = await nodeClient.getTX(tx.rhash());
    assert(txFromHash, 'The tx does not appear to be in the mempool or chain');
    if (debug === 1) console.log('Success!');
    if (debug) console.log('Tx: ', tx);
    // if it was successful then we can clear our saved tx info since it is now
    // obsolete. Clearing this will re-enable the first evaluation branch above
    fs.writeFileSync(txInfoPath, '');
  } else {
    throw new Error('No TX data to redeem with, ensure your TX data is named "tx-info.json" in the project root');
  }
}

export const getBcoinWallet = async (
  usingLedger,
  walletId,
  network,
  walletClient,
  purpose,
  coinType,
  dPath,
  passphrase,
  mnemonic,
  debug: Number = 0
) => {
  let wallet, ledgerBcoin;
  if (usingLedger) {
    const accountPath = `m/${purpose}'/${coinType}'/${dPath}'`;
    ledgerBcoin = await ledgerUtil.getLedgerBcoin(network);
    wallet = await ledgerUtil.getWalletFromLedger(
      ledgerBcoin,
      accountPath,
      network,
      walletClient,
      walletId,
      passphrase
    );
  } else {
    let options;
    if (mnemonic) {
      options = {
        passphrase: '',
        witness: true,
        mnemonic: mnemonic.toString(),
      };
    } else {
      options = {
        passphrase: passphrase,
        witness: true,
      };
    }
    try {
      // create new wallet with options
      await walletClient.createWallet(walletId, options);
    } catch (e) {
      // fail gracefully
    }
    // grab the wallet
    wallet = walletClient.wallet(walletId);
  }
  return { wallet, ledgerBcoin };
}

export const createOrGetAccount = async (wallet, account) => {
  try {
    return await wallet.createAccount(account);
  } catch (error) {
    return await wallet.getAccount(account);
  }
}

export const getTxDataFromIPFS = async (txsOfInterest, nodeClient, network, multiAddr) => {
  const ipfs = ipfsClient(multiAddr);
  const parsedIpfsData: Array<any> = await Promise.all(txsOfInterest.map(async txData => {
    const ipfsData = await ipfs.get(txData[1]);
    return JSON.parse(ipfsData[0].content);
  }));

  return (await Promise.all(txsOfInterest.map(async (txData, inx) => {
    return (await Promise.all(txData[0].vout.map(async output => {
      // Check for P2WSH
      if (output.scriptPubKey.type === 'WITNESSSCRIPTHASH') {
        // Search through IPFS templated tx
        const data = await Promise.all(parsedIpfsData[inx].prevTx.outputs.map(async out => {
          const result = await nodeClient.execute('decodescript', [ out.script ]);
          if (result.type === 'WITNESSSCRIPTHASH') {
            // Ensure locking addresses match
            if (result.addresses[0] === output.scriptPubKey.addresses[0] &&
                output.scriptPubKey.addresses[0] === parsedIpfsData[inx].lockingAddr) {
              // Regenerate the script with the stored values
              const regeneratedScript = createScript(parsedIpfsData[inx].locktime, Buffer.from(parsedIpfsData[inx].publicKeyHash));
              // Get the P2WSH
              const lockingAddr = getAddress(regeneratedScript, network);
              // Check final addresses match
              return (parsedIpfsData[inx].lockingAddr === lockingAddr) ? {
                ...txData[2],
                lockAmt: output.value,
                lockAddr: output.scriptPubKey.addresses[0],
              } : false;
            }
          }
        }));
        return data.filter(elt => (!!elt));
      }
    })))
    .filter(elt => (!!elt))
    .map(elt => elt[0]);
  })))
  .map(elt => elt[0]);
};

export const queryAllLocks = async (startBlock, endBlock, nodeClient, network, multiAddr) => {
  let locks = [];
  const txsOfInterest = [];
  for (var i = startBlock; i <= endBlock; i++) {
    const block = await nodeClient.getBlock(i);
    if (block) {
      block.txs.map(async tx => {
        const decodedTx = await nodeClient.execute('decoderawtransaction', [ tx.hex ]);
        decodedTx.vout.forEach(output => {
          if (output.scriptPubKey.type === 'NULLDATA') {
            const data = output.scriptPubKey.asm.split(' ')[1];
            const potentialHash = Buffer.from(data, 'hex').toString();
            try {
              let mh = multihashes.decode(multihashes.fromB58String(potentialHash))
              if (multihashes.isValidCode(mh.code)) {
                txsOfInterest.push([decodedTx, potentialHash, tx]);
              }
            } catch (e) {
              // fail gracefully
            }
          }
        });
      });
    }
  }

  return await getTxDataFromIPFS(txsOfInterest, nodeClient, network, multiAddr);
};

export const queryIndividualLock = async (queryObj: { address?: string, txHash?: string}, nodeClient, network, multiAddr) => {
  if (queryObj.address) {
    const result = await nodeClient.getTXByAddress(queryObj.address);
    const txsOfInterest = (await Promise.all(result.map(async tx => {
      let txTemplate;
      const decodedTx = await nodeClient.execute('decoderawtransaction', [ tx.hex ]);
      decodedTx.vout.forEach(output => {
        if (output.scriptPubKey.type === 'NULLDATA') {
          const data = output.scriptPubKey.asm.split(' ')[1];
          const potentialHash = Buffer.from(data, 'hex').toString();
          try {
            let mh = multihashes.decode(multihashes.fromB58String(potentialHash))
            if (multihashes.isValidCode(mh.code)) {
              txTemplate = [decodedTx, potentialHash, tx];
            }
          } catch (e) {
            // fail gracefully
          }
        }
      });

      return txTemplate;
    })))
    .filter(elt => (!!elt))
    return await getTxDataFromIPFS(txsOfInterest, nodeClient, network, multiAddr);
  }

  if (queryObj.txHash) {
    const result = await nodeClient.getTX(queryObj.txHash);
    const decodedTx = await nodeClient.execute('decoderawtransaction', [ result.hex ]);
    let txTemplate;
    decodedTx.vout.forEach(output => {
      if (output.scriptPubKey.type === 'NULLDATA') {
        const data = output.scriptPubKey.asm.split(' ')[1];
        const potentialHash = Buffer.from(data, 'hex').toString();
        try {
          let mh = multihashes.decode(multihashes.fromB58String(potentialHash))
          if (multihashes.isValidCode(mh.code)) {
            txTemplate = [decodedTx, potentialHash];
          }
        } catch (e) {
          // fail gracefully
        }
      }
    });

    if (txTemplate) {
      return await getTxDataFromIPFS([txTemplate], nodeClient, network, multiAddr);
    }
  }
};
