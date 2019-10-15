import * as btc from '../src/btcLock';
import { Amount, Network, KeyRing, Address } from 'bcoin';
import bledger from 'bledger';
import Logger from 'blgr';
import assert from 'assert';

describe('bitcoin locks', () => {
  const network = Network.get('regtest');
  const amount = Amount.fromBTC('.5');
  const multiAddress = undefined;
  const cosmosAddress = '0x01';
  const locktime = undefined;
  const usingLedger = false;
  const ledgerKeyPurpose = 44;
  const ledgerKeyCoinType = 0;
  const ledgerKeyDPath = 0;

  it('should use the lockAndRedeem script', async () => {
    const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
    const result = await btc.lockAndRedeemCLTV(
      multiAddress,
      cosmosAddress,
      amount,
      network,
      nodeClient,
      walletClient,
      'primary',
      locktime,
      usingLedger,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
    );
  });

  it.only('should test the ledger', async () => {
    const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
    walletClient.rescan(10000);
    const device = await btc.getLedgerDevice();
    const hd = await btc.getLedgerHD(
      device,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
    );
    let account = 'default';
    let watchId = 'watchonly1';
    let keyring = KeyRing.fromPublic(hd.publicKey, network);
    keyring.witness = true;
    let pkh = keyring.getKeyHash();
    let redeemAddress = keyring.getAddress();
    console.log(redeemAddress.toBase58(network));

    let watchWallet;
    try {
      watchWallet = await btc.createNewWallet(
        walletClient,
        watchId,
        'password',
        true,
        true,
        hd.xpubkey(network));
    } catch (e) {
      watchWallet = walletClient.wallet(watchId);
    }
    let addr;
    const res = await watchWallet.createAddress(account);
    console.log(res);
    try {
      addr = await watchWallet.createAccount(account);
    } catch (e) {
      addr = await watchWallet.getAccount(account);
    }
    console.log(addr);
    const coins = await watchWallet.getCoins();
    console.log(coins);
    const balance = await watchWallet.getBalance();
    console.log(balance);
  }).timeout(20000);
});