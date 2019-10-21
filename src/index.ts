#!/usr/bin/env ts-node
require('dotenv').config();
import fs from 'fs';
import program from 'commander';
import path from 'path';
import chalk from 'chalk';
import * as btc from './btcLock';
import * as eth from './ethLock';
import { Getters, queryLocks } from './cosmosQuery';
import { Amount } from 'bcoin';

// CLI Constants
const LOCK_LENGTH = 182; // 182 days
// Bitcoin parameters
const BTC_BIP39_MNEMONIC_SEED = process.env.BTC_BIP39_MNEMONIC_SEED;
const BTC_NETWORK_SETTING = process.env.BITCOIN_NETWORK_SETTING || 'regtest';
// Bcoin parameters
const BCOIN_WALLET_ID = process.env.BCOIN_WALLET_ID || 'primary';
const BCOIN_WALLET_ACCOUNT = process.env.BCOIN_WALLET_ACCOUNT || 'default';
const BCOIN_WALLET_PASSPHRASE = process.env.BCOIN_WALLET_PASSPHRASE || '';
// IPFS multiaddr
const IPFS_MULTIADDR = process.env.IPFS_MULTIADDR || '/ip4/127.0.0.1/tcp/5002';
// Ethereum parameters
const LOCKDROP_CONTRACT_ADDRESS = process.env.LOCKDROP_CONTRACT_ADDRESS;
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const ETH_KEY_PATH = process.env.ETH_KEY_PATH;
const ETH_JSON_PASSWORD = process.env.ETH_JSON_PASSWORD;
const ETH_JSON_VERSION = process.env.ETH_JSON_VERSION;
// Infura API url
const INFURA_PATH = process.env.INFURA_PATH;
// Cosmos/Supernova
const SUPERNOVA_ADDRESS = process.env.SUPERNOVA_ADDRESS;
const COSMOS_REST_URL = process.env.COSMOS_REST_URL || 'http://149.28.47.49:1318';
// Ledger parameters (NOT WORKING)
const LEDGER_KEY_PURPOSE = process.env.LEDGER_KEY_PURPOSE || 44;
const LEDGER_COIN_TYPE = process.env.LEDGER_COIN_TYPE || 0;
const LEDGER_DERIVATION_PATH = process.env.LEDGER_DERIVATION_PATH || 0;
// Stdout coloring
const error = chalk.bold.red;
const warning = chalk.keyword('orange');

const execName = path.basename(process.argv[1]);

function assert(condition, message) {
  if (!condition) {
      message = error.underline(message || "Assertion failed");
      if (typeof Error !== "undefined") { throw new Error(message); }
      throw message; // Fallback
  }
}

function printNoKeyError(customMsg) {
  console.log('');
  console.log(`\t${error.underline('You must provide a private key as an environment variable!')}`);
  console.log(`\t${error.underline(`If you use an environment variable, ${customMsg}`)}`)
  console.log('');
}

function getEthereumKeyFromEnvVar() {
  return (ETH_PRIVATE_KEY)
    ? eth.getPrivateKeyFromEnvVar(ETH_PRIVATE_KEY)
    : eth.getPrivateKeyFromEncryptedJson(ETH_KEY_PATH, ETH_JSON_VERSION, ETH_JSON_PASSWORD);
}

program.version('1.0.0')
  .name(execName)
  .option('--eth', 'Use ETH protocol commands')
  .option('--btc', 'Use BTC protocol commands')
  .option('--cosmos', 'Use Cosmos protocol commands')
  .option('--lock <amount>', 'Lock some number of tokens using decimal representation')
  .option('--query <lockHeight>', 'Query the cosmos chain')
  .option('--unlock', 'Unlock tokens')
  .option('--debug', 'Turn full debug logs on')
  .option('--nativeWallet', 'Flag for signalling use of the native Bcoin wallet')
  .option('--usingLedger', 'Flag for signalling use of a compatible Ledger device')
  .option('--walletId', 'A non-default wallet ID for bcoin configuration')
  .option('--walletAccount', 'A non-default wallet account for bcoin configuratio')
  .option('-o, --output <filename>', 'Specify an output file for query data')
  .option('-v, --verbose', 'Print more log output');

program.on('--help', () => {
  console.log('');
  console.log('Examples (TODO):');
});

program.parse(process.argv);

// configure logging settings
program.debug = (program.debug) ? 1 : 0;
// configure ledger settings if they exist
if (program.usingLedger) {
  program.ledgerKeyPurpose = program.ledgerKeyPurpose || process.env.LEDGER_KEY_PURPOSE;
  program.ledgerKeyCoinType = program.ledgerKeyCoinType || process.env.LEDGER_COIN_TYPE;
  program.ledgerKeyDPath = program.ledgerKeyDPath || process.env.LEDGER_DERIVATION_PATH;
}

const msg = `${(program.lock) ? 'to lock on' : (program.cosmos) ? 'to query the lockdrop on' : 'to withdraw'}`;

if (program.eth) {
  (async () => {
    console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
    if (typeof ETH_PRIVATE_KEY === 'undefined' && typeof ETH_KEY_PATH === 'undefined') {
      printNoKeyError('ensure your Ethereum key is formatted under ETH_PRIVATE_KEY or stored as a keystore file under ETH_KEY_PATH');
      process.exit(1);
    } else {
      const key = getEthereumKeyFromEnvVar();
      await eth.lock(key, program.lock, '0x01', LOCKDROP_CONTRACT_ADDRESS, INFURA_PATH);
    }
  })();
}

if (program.btc) {
  (async () => {
    console.log(`Using the Supernova Lockdrop CLI ${msg} Bitcoin`);
    if (!program.nativeWallet && typeof BTC_BIP39_MNEMONIC_SEED === 'undefined') {
      printNoKeyError('ensure your Bitcoin mnemonic is formatted under BTC_BIP39_MNEMONIC_SEED');
      process.exit(1);
    } else {
      const ipfsMultiaddr = program.ipfsMultiaddr || IPFS_MULTIADDR;
      const supernovaAddress = program.supernovaAddress || SUPERNOVA_ADDRESS;
      const network = btc.getNetworkSetting(BTC_NETWORK_SETTING);
      const amountToFund = Amount.fromBTC(program.lock);
      const walletId = program.walletID || BCOIN_WALLET_ID;
      const account = program.walletAccount || BCOIN_WALLET_ACCOUNT;
      const passphrase = program.passphrase || BCOIN_WALLET_PASSPHRASE;
      const ledgerKeyPurpose = program.ledgerKeyPurpose || LEDGER_KEY_PURPOSE;
      const ledgerKeyCoinType = program.ledgerKeyCoinType || LEDGER_COIN_TYPE;
      const ledgerKeyDPath = program.ledgerKeyDPath || LEDGER_DERIVATION_PATH;
      const usingLedger = program.usingLedger || false;
      console.log(`Ledger: ${usingLedger}, Wallet: ${walletId}, Amount: ${amountToFund.toValue()}, Account: ${account}, Multiaddr: ${ipfsMultiaddr}`)
      const { nodeClient, walletClient } = btc.setupBcoin(network, 'test');
      const { wallet, ledgerBcoin } = await btc.getBcoinWallet(
        usingLedger,
        walletId,
        network,
        walletClient,
        ledgerKeyPurpose,
        ledgerKeyCoinType,
        ledgerKeyDPath,
        passphrase,
        BTC_BIP39_MNEMONIC_SEED,
      );
  
      return (program.lock)
        ? await btc.lock(
          ipfsMultiaddr,
          supernovaAddress,
          amountToFund,
          network,
          nodeClient,
          wallet,
          account,
          usingLedger,
          ledgerBcoin,
          program.debug)
        : await btc.redeem(
          network,
          nodeClient,
          wallet,
          program.debug
        );
    }
  })();
}

if (program.cosmos) {
  (async () => {
    console.log(`Using the Supernova Lockdrop CLI ${msg} Cosmos`);
    // initialize getters for API
    const quiet = !program.verbose;
    const getters = new Getters(COSMOS_REST_URL, quiet);
    await getters.init();
  
    // query validator and delegator information to compute locks
    const lockHeight = program.query || getters.latestHeight;
    const locks = await queryLocks(getters, lockHeight, quiet);
    const lockJson = JSON.stringify(locks, null, 2);
    if (program.output) {
      fs.writeFileSync(program.output, lockJson);
    } else {
      process.stdout.write(lockJson);
    }
  })();
}