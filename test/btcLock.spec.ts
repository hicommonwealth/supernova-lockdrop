import * as btc from '../src/btcLock';
import {
  Amount, Coin, KeyRing, MTX, Network,
  Outpoint, Script, ScriptNum, Stack
} from 'bcoin';
import assert from 'assert';

describe('bitcoin locks', () => {
  const network = Network.get('regtest');

  it('should fund an account and lock those funds', async () => {
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
    const script = btc.createScript(locktime, pkh);
    keyring.script = script;

    // 3) Create the address
    const lockingAddr = btc.getAddress(script, network);

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
  });
});