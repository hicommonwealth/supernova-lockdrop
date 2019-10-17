import {
  Amount,
  Coin,
  KeyRing,
  MTX,
  Network,
  Script,
  ScriptNum,
  Stack,
  Wallet,
  Address,
  TX,
} from 'bcoin';
import bcoin from 'bcoin';
import { WalletClient, NodeClient } from 'bclient';
import bledger from 'bledger';
import Logger from 'blgr';
import fs from 'fs';
import * as ipfs from './ipfsUtil';
import assert from 'assert';

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

export const setupBcoin = (network, apiKey) => {
  const clientOptions = {
    network: network.type,
    port: network.rpcPort,
    apiKey: apiKey,
  }

  const walletOptions = {
    network: network.type,
    port: network.walletPort,
    apiKey: apiKey,
  }

  const nodeClient = new NodeClient(clientOptions);
  const walletClient = new WalletClient(walletOptions);

  return { nodeClient, walletClient };
}

/**
 * Create a new Bcoin wallet
 * @param id - Wallet ID (used for storage)
 * @param passphrase - A strong passphrase used to encrypt the wallet
 * @param witness - Whether to use witness programs
 * @param watchOnly - (watch-only for CLI)
 * @param accountKey - The extended public key for the primary account in the new wallet. This value is ignored if watchOnly is false
 */
export const createNewWallet = async (
  walletClient: WalletClient,
  id: String = 'primary',
  passphrase: String = 'password',
  witness: Boolean = false,
  watchOnly: Boolean = false,
  accountKey: String,
) => {
  const options = {
    passphrase: passphrase,
    witness: witness,
    watchOnly: watchOnly,
    accountKey: accountKey
  };

  return await walletClient.createWallet(id, options);
};

export const getNetworkSettings = (network) => {
  switch (network) {
    case 'regtest':
      return Network.get('regtest');
    case 'testnet':
      return Network.get('testnet');
    case 'mainnet':
      return Network.get('main');
    default:
      return Network.get('main');
  }
}

export const addToIPFS = async (
  multiAddr: string,
  cosmosAddress: string,
  lockingAddr: string,
  redeemScript: string,
  locktime: Number,
  redeemAddress: string,
): Promise<Buffer> => {
  try {
    const ipfsData = JSON.stringify({
      cosmosAddress,
      lockingAddr,
      redeemScript,
      locktime,
      redeemAddress,
    });

    const ipfsHash = await ipfs.sendData(multiAddr, ipfsData);
    const buf = Buffer.from(ipfsHash);
    return buf;
  } catch (e) {
    console.log('You must connect to a local or remote IPFS node to store data');
    throw new Error(e);
  }
}

export const getLedgerDevice = async () => {
  // Setup logging for ledger
  const logger = new Logger({
    console: true,
    level: 'info'
  });
  const { Device } = bledger.USB;
  // get first device available.
  const device = await Device.requestDevice();
  device.set({
    timeout: 10000,
    logger,
  });
  // open device and return the object afterwards
  await device.open();
  return device;
}

export const getLedgerHD = async (device, accountPath): Promise<any> => {
  const { LedgerBcoin } = bledger;
  const ledgerBcoin = new LedgerBcoin({ device });
  return await ledgerBcoin.getPublicKey(accountPath);
};

export const writeTxToFile = (txInfoPath, lockedTx, lockingAddr, redeemScript, locktime, redeemAddress) => {
  // save the transaction information to to a file
  fs.writeFileSync(txInfoPath, JSON.stringify({
    lockedTx,
    lockingAddr,
    redeemScript,
    locktime,
    redeemAddress,
  }, null, 2));
}

export interface IScriptData {
  pkh: string;
  redeemAddress: string;
  wallet: Wallet,
  device: any,
  hd: any,
};

export const getPublicKeyAndRedeem = async (
  usingLedger: Boolean,
  accountPath: string,
  network: Network,
  walletClient: WalletClient,
  nodeClient: NodeClient,
  walletId: string,
  amountToFund: Amount,
  account: string,
  password: string,
): Promise<IScriptData> => {
  let wallet, device, hd;
  // first grab device if we are using the ledger
  if (usingLedger) {
    device = await getLedgerDevice();
    hd = await getLedgerHD(device, accountPath);
    try {
      wallet = await createNewWallet(
        walletClient,
        walletId,
        password,
        true,
        true,
        hd.xpubkey(network));
    } catch (e) {
     // wallet exists so we continue forward
    }
  }
  // init the wallet
  wallet = walletClient.wallet(walletId);
  let { balance } = await wallet.getInfo();
  let publicKey, address;
  const redeemInfoPath = 'redeem-info.json';
  let redeemInfo = fs.existsSync(redeemInfoPath) ? fs.readFileSync(redeemInfoPath) : '';
  if (redeemInfo.length > 0) {
    const rInfo = JSON.parse(redeemInfo.toString());
    publicKey = rInfo.publicKey;
    address = rInfo.address;
  } else {
    let res = await wallet.createAddress(account);
    publicKey = res.publicKey;
    address = res.address;
    fs.writeFileSync('redeem-info.json', JSON.stringify({ publicKey, address }));
  }
  // For testing only, if the account is not funded yet
  if (balance.confirmed <= amountToFund.toValue() && network.type === 'regtest') {
    // Fund the account by generating blocks
    await nodeClient.execute('generatetoaddress', [ 101, address ]);
    const result = await wallet.getInfo();
    balance = result.balance;
  }
  // Assert the account has necessary balance
  assert(balance.confirmed > amountToFund.toValue(), 'Not enough funds!');
  // create the keyring from the public key and get the public key hash for the locking script
  const keyring = KeyRing.fromKey(Buffer.from(publicKey, 'hex'), true);
  keyring.witness = true;
  // return the pkh and redeemAddress to be input into the lock script
  return {
    pkh: keyring.getKeyHash(),
    redeemAddress: address,
    wallet,
    device,
    hd,
  };
}

export const sendTxUsingWallet = async (wallet, outputs: any[]) => {
  return await wallet.send({ outputs, rate: 7000 });
};

export const sendTxUsingLedger = async (wallet, device, outputs, account, hd, accountPath, amountToFund) => {
  const { LedgerBcoin, LedgerTXInput } = bledger;
  const ledgerBcoin = new LedgerBcoin({ device });
  // create mutable tx
  let mtx = new MTX();
  // add outputs
  outputs.forEach(o => {
    mtx.addOutput(o);
  });
  // get coins from the watch only wallet
  const coins = await wallet.getCoins();
  const change = await wallet.createChange(account);
  // collect only necessary coins
  let ledgerInputs = [];
  let ledgerCoins = [];
  const amount = Number(amountToFund.toValue());
  let runningAmount = 0;
  for (const coin of coins) {
    if (runningAmount >= amount) break;
    runningAmount += coin.value;
    const result = await wallet.getTX(coin.hash);
    console.log('\n\n');
    console.log(result);
    console.log('\n\n');
    let txFromRaw = TX.fromRaw(Buffer.from(result.tx, 'hex'));
    result.outputs.forEach((out, inx) => {
      if (out.value > 0) {
        const ledgerInput = new LedgerTXInput({
          witness: true,
          tx: txFromRaw,
          index: inx,
          redeem: txFromRaw.outputs[inx].script,
          path: out.path.derivation,
          publicKey: hd.publicKey,
        });
        ledgerInputs.push(ledgerInput);
      }
    });

    ledgerCoins.push(Coin.fromJSON(coin));
    
  }
  // fund tx with coins, use change address for leftover
  await mtx.fund(ledgerCoins, {
    changeAddress: change.address,
  });
  console.log(mtx);
  const result = await mtx.check();
  const r = await ledgerBcoin.signTransaction(mtx, ledgerInputs);
  return {};
};

export const lockAndRedeemCLTV = async (
  multiAddr: string,
  cosmosAddress: string,
  amountToFund: Amount,
  network: Network,
  nodeClient: NodeClient,
  walletClient: WalletClient,
  walletId: string,
  locktime: Number,
  usingLedger: Boolean = false,
  purpose: Number = 44,
  coinType: Number = 0,
  dPath: Number = 0,
  account: string,
  password: string,
): Promise<any> => {
  try {
    const txInfoPath = './tx-info.json'; // this is where we'll persist our info

    let redeemScript, lockingAddr;

    // check if file exists and if there is info saved to it
    let txInfo = fs.existsSync(txInfoPath) ? fs.readFileSync(txInfoPath) : '';
    if (!txInfo.length) {
      // No saved transaction, so let's create it and then save the information for later
      console.log('No TX found, creating a new CLTV tx');
      const accountPath = `m/${purpose}'/${coinType}'/${dPath}'`;
      const { pkh, redeemAddress, wallet, device, hd } = await getPublicKeyAndRedeem(
        usingLedger,
        accountPath,
        network,
        walletClient,
        nodeClient,
        walletId,
        amountToFund,
        account,
        password,
      );
      // For testing, if no locktime is provided use 10 blocks ahead
      if (!locktime && network.type === 'regtest') {
        // Get current height and set locktime to 10 blocks from now
        const { chain: { height }} = await nodeClient.getInfo();
        locktime = height + 10;
      } else {
        if (!locktime) throw new Error('You must provide a valid locktime');
      }
      // create the script and address that can be redeemed by our wallet
      redeemScript = createScript(locktime.toString(), pkh);
      lockingAddr = getAddress(redeemScript, network);
      // add data to IPFS for later querying
      const buf = await addToIPFS(multiAddr, cosmosAddress, lockingAddr, redeemScript, locktime, redeemAddress);
      // create funding output and OP_RETURN output with IPFS hash
      const nullScript = bcoin.Script.fromNulldata(buf)
      const nullOutput = bcoin.Output.fromScript(nullScript, 0);
      const outputs = [nullOutput, {
        value: amountToFund.toValue(),
        address: lockingAddr,
      }];

      let lockedTx;
      if (usingLedger) {
        console.log(`Using the ledger wallet with id ${walletId}, account ${account}`);
        lockedTx = await sendTxUsingLedger(
          wallet,
          device,
          outputs,
          account,
          hd,
          accountPath,
          amountToFund,
        );
      } else {
        console.log(`Using the local wallet with id ${walletId}, account ${account}`);
        lockedTx = await sendTxUsingWallet(wallet, outputs);
      }
      console.log('transaction sent to mempool');
      writeTxToFile(txInfoPath, lockedTx, lockingAddr, redeemScript, locktime, redeemAddress);
    } else {
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
      if (usingLedger) {
        // TODO: Fill in with Ledger
      } else {
        // instantiate a client for our wallet
        const wallet = walletClient.wallet(walletId);
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
      }

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
      console.log(mtx.check());
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
      console.log('Success!');
      console.log('Tx: ', tx);

      // if it was successful then we can clear our saved tx info since it is now
      // obsolete. Clearing this will re-enable the first evaluation branch above
      fs.writeFileSync(txInfoPath, '');
    }
  } catch(e) {
    console.error('There was an error with live solution:', e);
  }
};