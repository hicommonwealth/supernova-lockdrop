const bitcoin = require('bitcoinjs-lib');
import bip65 from 'bip65';
import bip39 from 'bip39';
import bip38 from 'bip38';
import bip32 from 'bip32';
import * as btc from '../src/btcLock';

const { RegtestUtils } = require('regtest-client')

describe('bitcoin locks', () => {
  const regtestUtils = new RegtestUtils(bitcoin)
  const network = regtestUtils.network // regtest network params

  it('should fund an account and lock those funds', async () => {
    const keyPair = bitcoin.ECPair.makeRandom({ network });
    const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });

    // fund this account
    const unspent = await regtestUtils.faucet(p2pkh.address, 2e4);
    // Get all current unspents of the address.
    const unspents = await regtestUtils.unspents(p2pkh.address);
    console.log(unspents);
  });
});