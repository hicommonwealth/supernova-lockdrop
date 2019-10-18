import * as btc from '../src/btcLock';
import { Amount, Network } from 'bcoin';
import { WalletClient, NodeClient } from 'bclient';

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

  it.only('should use the lockAndRedeem script', async () => {
    const usingLedger = false;
    const walletId = 'primary';
    const { nodeClient, walletClient } = setupBcoin(network, 'test');
    const { wallet, ledgerBcoin } = await btc.getBcoinWallet(
      usingLedger,
      walletId,
      network,
      walletClient,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
      password
    );
    const result = await btc.lockAndRedeemCLTV(
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
  });

  it('should use the lockAndRedeem script with the Ledger', async () => {
    const usingLedger = true;
    const walletId = 'watchonly1';
    const { nodeClient, walletClient } = setupBcoin(network, 'test');
    const { wallet, ledgerBcoin } = await btc.getBcoinWallet(
      usingLedger,
      walletId,
      network,
      walletClient,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
      password
    );
    const result = await btc.lockAndRedeemCLTV(
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
  }).timeout(10000);
});