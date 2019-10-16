import * as btc from '../src/btcLock';
import { Amount, Network, KeyRing, Address } from 'bcoin';
import bledger from 'bledger';
import Logger from 'blgr';
import assert from 'assert';

describe('bitcoin locks', () => {
  let network = Network.get('regtest');
  let amount = Amount.fromBTC('.5');
  let multiAddress = undefined;
  let cosmosAddress = '0x01';
  let locktime = undefined;
  let ledgerKeyPurpose = 44;
  let ledgerKeyCoinType = 0;
  let ledgerKeyDPath = 0;
  let account = 'default';
  let password = 'password';

  it('should use the lockAndRedeem script', async () => {
    const usingLedger = false;
    const walletId = 'primary';
    const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
    const result = await btc.lockAndRedeemCLTV(
      multiAddress,
      cosmosAddress,
      amount,
      network,
      nodeClient,
      walletClient,
      walletId,
      locktime,
      usingLedger,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
      account,
      password,
    );
  });

  it.only('should use the lockAndRedeem script with the Ledger', async () => {
    const usingLedger = true;
    const walletId = 'watchonly1';
    const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
    const result = await btc.lockAndRedeemCLTV(
      multiAddress,
      cosmosAddress,
      amount,
      network,
      nodeClient,
      walletClient,
      walletId,
      locktime,
      usingLedger,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
      account,
      password,
    );
  });
  // it.only('should test the ledger', async () => {
  //   const usingLedger = true;
  //   const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
  //   const device = await btc.getLedgerDevice();
  //   const hd = await btc.getLedgerHD(
  //     device,
  //     ledgerKeyPurpose,
  //     ledgerKeyCoinType,
  //     ledgerKeyDPath,
  //   );
  //   let account = 'default';
  //   let watchId = 'watchonly1';

  //   let redeemAddress, publicKey;
  //   let watchWallet = walletClient.wallet(watchId);
  //   let info = await watchWallet.getInfo();
  //   if (!info) {
  //     watchWallet = await btc.createNewWallet(
  //       walletClient,
  //       watchId,
  //       'password',
  //       true,
  //       true,
  //       hd.xpubkey(network));
  //   }

  //   const addressRes = await watchWallet.createAddress(account);
  //   console.log(addressRes);
  //   let addr;
  //   try {
  //     addr = await watchWallet.createAccount(account);
  //   } catch (e) {
  //     addr = await watchWallet.getAccount(account);
  //   }
  //   console.log(addr);

  //   redeemAddress = addressRes.redeemAddress;
  //   publicKey = addressRes.publicKey;

  //   const keyring = KeyRing.fromKey(Buffer.from(publicKey, 'hex'), true);
  //   keyring.witness = true;
  //   const pkh = keyring.getKeyHash();
  //   console.log(pkh, redeemAddress);
  //   // try {

  //   // } catch (e) {
  //   //   console.log(e);
      
  //   // }
  //   // let addr;
  //   // const res = await watchWallet.createAddress(account);
  //   // console.log(res);
  //   // try {
  //   //   addr = await watchWallet.createAccount(account);
  //   // } catch (e) {
  //   //   addr = await watchWallet.getAccount(account);
  //   // }
  //   // console.log(addr);

  //   // const result = await btc.lockAndRedeemCLTV(
  //   //   multiAddress,
  //   //   cosmosAddress,
  //   //   amount,
  //   //   network,
  //   //   nodeClient,
  //   //   walletClient,
  //   //   'primary',
  //   //   locktime,
  //   //   usingLedger,
  //   //   ledgerKeyPurpose,
  //   //   ledgerKeyCoinType,
  //   //   ledgerKeyDPath,
  //   //   account,
  //   // );
  // }).timeout(20000);
});