import {
  Amount, Coin, KeyRing, MTX, Network,
  Outpoint, Script, ScriptNum, Stack
} from 'bcoin';
import { WalletClient, NodeClient } from 'bclient';
import fs from 'fs';

import assert from 'assert';

/**
 * @param {String} locktime - Time that the script can not be redeemed before
 * @param {Buffer} public key hash
 * @returns {Script}
**/
export const createScript = (locktime, publicKeyHash) => {
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

// /**
//  * Lock BTC up in a CTLV P2SH transaction
//  * @param   {number}  locktime              The future block to lock until
//  * @param   {number}  amount                The amount of BTC to lock up
//  * @param   {string}  comsosAddress         The comsos address
//  * @param   {object}  [unspentOutputs=None] The unspent output
//  * @param   {object}  [network=None]        The network
//  */
// export const lock = async (keyring, locktime, amount, comsosAddress, unspentOutputs, network, changeAddress=undefined, changeAmount=undefined) => {
//   const lockTxHex = createlockTx(
//     keyring.getKeyHash(),
//     locktime,
//     amount,
//     comsosAddress,
//     unspentOutputs,
//     network,
//     changeAddress,
//     changeAmount);
//   console.log(lockTxHex);
// };

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

export const lockAndRedeemCLTV = async (amountToFund, network, nodeClient, walletClient, walletId, walletAccount) => {
  try {
    const txInfoPath = './tx-info.json'; // this is where we'll persist our info
    const wallet = walletClient.wallet(walletId); // instantiate a client for our wallet
    let redeemScript, lockingAddr, locktime;

    // check if file exists and if there is info saved to it
    let txInfo = fs.existsSync(txInfoPath) ? fs.readFileSync(txInfoPath) : '';
    if (!txInfo.length) {
      // No saved transaction, so let's create it and then
      // save the information for later
      console.log('No TX found, creating a new CLTV tx');
      // Step 1: Setup wallet client and confirm balance
      const result = await wallet.getInfo();
      // Step 2: Setup keyring w/ pkh and create locking address
      // that can be redeemed by our real wallet after a set locktime
      const { publicKey, address } = await wallet.createAddress('default');
      // For testing only, if the account is not funded yet
      if (result.balance.confirmed <= 0) {
        // Fund the account by generating 5 blocks
        let txids = await nodeClient.execute('generatetoaddress', [ 5, address ]);
        // Print out the coinbase tx ids
        console.log(txids);
      } else {
        console.log(result.balance.confirmed, amountToFund.toValue(), result.balance.confirmed > amountToFund.toValue())
        assert(result.balance.confirmed > amountToFund.toValue(), 'Not enough funds!');
      }
      // create the keyring from the public key
      // and get the public key hash for the locking script
      const keyring = KeyRing.fromKey(Buffer.from(publicKey, 'hex'), true);
      keyring.witness = true;
      const pkh = keyring.getKeyHash();
      // Get current height and set locktime to 10 blocks from now
      const { chain: { height }} = await nodeClient.getInfo();
      locktime = height + 10;

      // create the script and address that can be redeemed by our wallet
      redeemScript = createScript(locktime.toString(), pkh);
      lockingAddr = getAddress(redeemScript, network);

      // Step 3: use the wallet client to send funds to the locking address
      const output = {
        value: amountToFund.toValue(),
        address: lockingAddr
      };
      const lockedTx = await wallet.send({ outputs: [output], rate: 7000 });
      console.log('transaction sent to mempool');
      // save the transaction information to to a file
      fs.writeFileSync(txInfoPath, JSON.stringify({
        lockedTx,
        lockingAddr,
        redeemScript,
        locktime,
        redeemAddress: address
      }, null, 2));
      if (network.type === 'regtest') {
        // mine one block to get tx on chain
        // make sure you're doing this on regtest or simnet and
        // not testnet or mainnet
        // this method won't work if you don't have a
        // coinbase address set on your miner
        // you can also use bPanel and the @bpanel/simple-mining
        // plugin to do this instead
        const minedBlock = await nodeClient.execute('generate', [1, address]);
        console.log('Block mined', minedBlock);
      }
    } else {
      // if the txInfo file exists then we know we have a locked tx
      // so let's get the information we need to start redeeming!
      const {
        lockedTx,
        lockingAddr,
        redeemScript,
        locktime,
        redeemAddress
      } = JSON.parse(txInfo);

      // 1) let's get the current block height to check if we can actually redeem
      const { chain: { height }} = await nodeClient.getInfo();

      // in reality this could be block height or Unix epoch time
      assert(locktime <= height, `Too soon to redeem the UTXO. Wait until block ${locktime}`);

      // Our locktime is less than or equal to height which means we can redeem

      // 2) Prepare redeeming tx

      // get index of utxo
      const index = lockedTx.outputs.findIndex(
        output => output.address === lockingAddr
      );

      // get the coin associated with our locked tx
      // indicating the index of the UTXO
      const coinJSON = await nodeClient.getCoin(lockedTx.hash, index);

      // create a new coin object that references the UTXO we want to spend
      // and add it as an input to a blank mutable transaction
      const coin = Coin.fromJSON(coinJSON);
      let mtx = new MTX();
      mtx.addCoin(coin);

      // For simplicity we'll redeem the locked tx to ourselves
      // But if you have another wallet that might be easier
      // since you can see the change in balance more easily
      const { address } = await wallet.createAddress('default');
      // send to the address the value of the coin minus the fee
      mtx.addOutput(address, coin.value - 1500);

      // set nLocktime field on transaction
      // mempool and chain will check against this
      // to verify finality for each input
      mtx.setLocktime(height);

      // 3) Setup a keyring to use for signing the input

      // First get the script from our saved tx info
      const script = Script.fromRaw(redeemScript, 'hex');

      // Next we'll get the private key associated with the pkh
      // that the timelocked UTXO is locked to
      // Note it's generally not safe to transfer your private key
      // unencrypted over the network like this, but we're doing it
      // here for simplicity
      const { privateKey } = await wallet.getWIF(redeemAddress);
      const ring = KeyRing.fromSecret(privateKey, network);
      ring.witness = true;
      ring.script= script;

      // 4) Script and sign the input
      // Note that we can use the same methods as in the mock transaction
      mtx = scriptInput(mtx, index, coin, ring);
      mtx = signInput(mtx, index, coin, ring);

      // 5) Verify and broadcast the tx
      // Note that the `verify` won't check against current height
      // of the blockchain and the node won't reject the tx but will
      // still try and broadcast (you can check your node logs for
      // mempool verification errors)
      assert(mtx.verify(), 'MTX did not verify');
      const tx = mtx.toTX();
      assert(tx.verify(mtx.view), 'TX did not verify');
      const raw = tx.toRaw().toString('hex');

      // now we've got a signed raw transaction that we can broadcast to the network!
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