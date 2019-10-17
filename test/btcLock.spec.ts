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
  let password = '';

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
  }).timeout(10000);
});