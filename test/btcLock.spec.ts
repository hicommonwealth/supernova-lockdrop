import * as btc from '../src/btcLock';
import { Amount, Network } from 'bcoin';
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
});