require('dotenv').config();
import * as btc from '../src/btcLock';
import { Amount, Network, Mnemonic, WalletDB } from 'bcoin';
import bcoin from 'bcoin';
import assert from 'assert';
import HDKey from 'hdkey';
const HD = bcoin.hd;

describe('bitcoin locks', () => {
  let network = Network.get('regtest');
  let amount = Amount.fromBTC('.5');
  let multiAddress = undefined;
  let cosmosAddress = '0x01';
  let ledgerKeyPurpose = 44;
  let ledgerKeyCoinType = 0;
  let ledgerKeyDPath = 0;
  let account = 'default';
  let password = '';

  /**
   * Ensure you have a running bcoin local regtest network for these tests to work
   */
  it('should recover a bcoin wallet from a mnemonic', async () => {
    const mnemonic24 = new Mnemonic({bits: 256});
    const { walletClient } = btc.setupBcoin(network, 'test');
    const options = {
      passphrase: '',
      witness: true,
      mnemonic: mnemonic24.toString(),
    };
    const walletId = 'new';
    try {
      const result = await walletClient.createWallet(walletId, options);
      assert(result.network === network.type);
      assert(result.id === 'new');
    } catch (e) {
      // let it fail gracefully
    }
    const wallet = walletClient.wallet(walletId);
    assert(wallet);
    const addressRes = await wallet.createAddress('default');
    assert(addressRes.address);
  });

  it('should import a WIF private key', async () => {
    const privateKey = process.env.BTC_PRIVATE_KEY_WIF;
    const walletId = 'new';
    const account = 'default';
    const { walletClient } = btc.setupBcoin(network, 'test');
    const wallet = walletClient.wallet(walletId);
    let result;
    try {
      result = await wallet.importPrivate(account, privateKey, '');
      console.log(result);
    } catch (error) {
      // fail gracefully if key is already created
    }
    result = await wallet.createAddress(account);
    assert(result);
    
  });

  it.skip('should create a Bcoin wallet from an HD key', async () => {
    const walletId = 'new5';
    const account = 'default';
    const { walletClient } = btc.setupBcoin(network, 'test');
    const key = 'tprv8ipSFuEcZmhg7KsUm67UJuVk6rieU5jNj94RqfyTBbAPALvheopZJsPvXXvBKrxsHTHXxqXB2y353MLAPUpDGyi6Mnw8dLaRvErhXrnQ178'
    const master = HD.fromBase58(key, network)
    const options = {
      passphrase: '',
      witness: false,
      master: master,
    };
    try {
      let result = await walletClient.createWallet(walletId, options);
      console.log(result);
    } catch (error) {
      
    }
    const wallet = walletClient.wallet(walletId);
    assert(wallet);
    let result = await wallet.getMaster();
    console.log(result);
  });

  it('should use the lock and redeem script', async () => {
    const usingLedger = false;
    const walletId = 'primary';
    const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
    const { wallet, ledgerBcoin } = await btc.getBcoinWallet(
      usingLedger,
      walletId,
      network,
      walletClient,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
      password,
      undefined,
    );

    let result = await btc.lock(
      multiAddress,
      cosmosAddress,
      amount,
      network,
      nodeClient,
      wallet,
      account,
      usingLedger,
      ledgerBcoin,
    );
    result = await nodeClient.execute('generatetoaddress', [ 101, 'n2J1YidZgqQKBD1bsEHaLL3NrTY2yRfPTx' ]);
    result = await btc.redeem(network, nodeClient, wallet);
  });
});