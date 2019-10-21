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
  let multiAddress = '/ip4/127.0.0.1/tcp/5002';
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

  it('should create a wallet or grab an existing wallet and not fail', async () => {
    const usingLedger = false;
    const walletId = 'primary2';
    const { walletClient } = btc.setupBcoin(network, 'test');
    const { wallet } = await btc.getBcoinWallet(
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

    assert(wallet.id, walletId);
  });

  it('should create a new account or grab an existing one and not fail', async () => {
    const usingLedger = false;
    const walletId = 'primary2';
    const { walletClient } = btc.setupBcoin(network, 'test');
    const { wallet } = await btc.getBcoinWallet(
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

    const accountName = 'default';
    const account = await btc.createOrGetAccount(wallet, accountName);
    assert(account.receiveAddress);
    assert(account.changeAddress);
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
      undefined
    );
    result = await nodeClient.execute('generatetoaddress', [ 101, 'n2J1YidZgqQKBD1bsEHaLL3NrTY2yRfPTx' ]);
    result = await btc.redeem(network, nodeClient, wallet);
  });
});