// some NodeJS helpers
const fs = require('fs');
const assert = require('assert');

// make sure you've installed bclient to your project
// `npm install --save bclient`
const { WalletClient, NodeClient } = require('bclient');

export default function(bcoin) {
  const {
    Amount,
    Coin,
    KeyRing,
    MTX,
    Network,
    Outpoint,
    Script,
    ScriptNum,
    Stack
  } = bcoin;

  // a helper object with information
  // about the regtest network
  const network = Network.get('regtest');

  // if your node needs an API key for access
  // you can import it like this for use in setting up your client
  const apiKey = 'api-key';
  const clientOptions = {
    network: network.type,
    apiKey: apiKey,
  }
  const walletClient = new WalletClient({...clientOptions, port: network.walletPort});
  const nodeClient = new NodeClient({ ...clientOptions, port: network.rpcPort });

  /**
   * @param {Script} script to get corresponding address for
   * @param {Network} to determine encoding based on network
   * @returns {Address} - p2wsh segwit address for specified network
  **/
  function getAddress(script, network) {
    // get the hash of the script
    // and derive address from that
    const p2wsh = script.forWitness();
    const segwitAddress = p2wsh.getAddress().toBech32(network);
    return segwitAddress;
  }

  /**
   * @param {String} locktime - Time that the script can not
   * be redeemed before
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

  function makeTx() {
    // We'll use this as a reference for later.
    // to get value in satoshis all you need is `amountToFund.toValue()`;
    const amountToFund = Amount.fromBTC('.5');

    // flags are for script and transaction verification
    const flags = Script.flags.STANDARD_VERIFY_FLAGS;

    // 1) Setup keyrings
    const keyring = KeyRing.generate(true);
    const keyring2 = KeyRing.generate(true);
    // can only be redeemed after the 100th block has been mined
    const locktime = '100';
    keyring.witness = true;
    keyring2.witness = true;

    // 2) Get hash and save it to keyring
    const pkh = keyring.getKeyHash();
    const script = createScript(locktime, pkh);
    keyring.script = script;

    // 3) Create the address
    const lockingAddr = getAddress(script, network);

    // 4) Create our funding transaction that sends
    // 50,000 satoshis to our locking address
    const cb = new MTX();

    cb.addInput({
      prevout: new Outpoint(),
      script: new Script(),
      sequence: 0xffffffff
    });

    // Send 50,000 satoshis to our locking address.
    // this will lock up the funds to whoever can solve
    // the CLTV script
    cb.addOutput(lockingAddr, amountToFund.toValue());

    // Convert the coinbase output to a Coin object
    // In reality you might get these coins from a wallet.
    // `fromTX` will take an output from a previous
    // tx and turn it into a coin object
    // (the second param is the index of the target UTXO)
    const coin = Coin.fromTX(cb, 0, -1);

    // 5) Setup the redeeming transaction
    // Start with an empty mutable transaction
    let mtx = new MTX();

    // add our cb coin as the input (i.e. the "funding" UTXO)
    mtx.addCoin(coin);

    // get an address to send the funds from the coin to
    const receiveAddr = keyring2.getAddress('string', network);

    // value of the input minus arbitrary amount for fee
    // normally we could do this by querying our node to estimate rate
    // or use the `fund` method if we had other coins to spend with
    const receiveValue = coin.value - 1000;
    mtx.addOutput(receiveAddr, receiveValue);

    // So now we have an mtx with the right input and output
    // but our input still hasn't been signed
    console.log('mtx:', mtx);
  }

  /* script the inputs w/ our custom script for an mtx
   * This is modeled after the scriptInput method on
   * the `MTX` class
   * @param {MTX} mtx with unscripted input
   * @param {Number} index - index of input to script
   * @param {Coin} coin- UTXO we are spending
   * @param {KeyRing} ring - keyring we are signing with
   * @returns {MTX}
  */
  function scriptInput(mtx, index, coin, ring) {
    const input = mtx.inputs[index];
    const prev = coin.script;
    const wsh = prev.getWitnessScripthash();
    assert(ring instanceof KeyRing, 'Must pass a KeyRing to scriptInput');
    // this is the redeem script used to verify the p2wsh hash
    wredeem = ring.getRedeem(wsh);

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

  async function lockAndRedeemCLTV(walletId) {
    try {
      const txInfoPath = './tx-info.json'; // this is where we'll persist our info
      const wallet = walletClient.wallet(walletId); // instantiate a client for our wallet

      let redeemScript, lockingAddr, locktime;

      // check if file exists and if there is info saved to it
      let txInfo = fs.existsSync(txInfoPath) ? fs.readFileSync(txInfoPath) : '';
      if (!txInfo.length) {
        // No saved transaction, so let's create it and then
        // save the information for later

        // Step 1: Setup wallet client and confirm balance
        const { balance } = await wallet.getInfo();
        assert(balance.confirmed > amountToFund.toValue(), 'Not enough funds!');

        // Step 2: Setup keyring w/ pkh and create locking address
        // that can be redeemed by our real wallet after a set locktime
        const { publicKey, address } = await wallet.createAddress('default');

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
        txInfo = { lockedTx, lockingAddr, redeemScript, locktime, redeemAddress: address };
        fs.writeFileSync(txInfoPath, JSON.stringify(txInfo, null, 2));

        // mine one block to get tx on chain
        // make sure you're doing this on regtest or simnet and
        // not testnet or mainnet
        // this method won't work if you don't have a
        // coinbase address set on your miner
        // you can also use bPanel and the @bpanel/simple-mining
        // plugin to do this instead
        const minedBlock = await nodeClient.execute('generate', [1]);
        console.log('Block mined', minedBlock);
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

  return {
    makeTx,
    createScript,
    getAddress,
    scriptInput,
    lockAndRedeemCLTV,
  };
}

