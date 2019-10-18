#!/usr/bin/env ts-node
require('dotenv').config();
import fs from 'fs';
import program from 'commander';
import path from 'path';
import chalk from 'chalk';
import bip32 from 'bip32';
import bip39 from 'bip39';
import * as btc from './btcLock';
import * as eth from './ethLock';
import { Getters, queryLocks } from './cosmosQuery';
import { Amount } from 'bcoin';

// CLI Constants
const LOCK_LENGTH = 182; // 182 days
// Bitcoin
const BTC_PRIVATE_KEY_WIF = process.env.BTC_PRIVATE_KEY_WIF;
const BTC_XPRV_KEY = process.env.BTC_XPRV_KEY;
const BTC_BIP39_MNEMONIC_SEED = process.env.BTC_BIP39_MNEMONIC_SEED;
const BTC_NETWORK_SETTING = process.env.BITCOIN_NETWORK_SETTING || 'regtest';
// IPFS multiaddr
const IPFS_MULTIADDR = process.env.IPFS_MULTIADDR || '/ip4/127.0.0.1/tcp/5002';
// Ethereum constants
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
// Stdout coloring
const error = chalk.bold.red;
const warning = chalk.keyword('orange');

const execName = path.basename(process.argv[1]);
program.version('1.0.0')
  .name(execName)
  .usage('<protocol> <function> [ARGS...]')
  .arguments('<protocol> <func> [args...]')
  .option('--nativeWallet', 'Flag for signalling use of the native Bcoin wallet')
  .option('--walletId', 'A non-default wallet ID for bcoin configuration')
  .option('--test', 'Test out some functionality')
  .option('-o, --output <filename>', 'Specify an output file for query data')
  .option('-v, --verbose', 'Print more log output')
  .action(async (protocol, func, args) => {
    console.log(program.test);

    console.log(`Protocol: ${protocol}, function: ${func}, args: ${args}`)
    const isLock = (func === 'lock');
    // technically anything other than 'lock' will trigger a query
    const msg = `${(isLock) ? 'to lock on' : (protocol === 'cosmos') ? 'to query the lockdrop on' : 'to withdraw'}`;
    // If isLock, then the arguments should be <protocol> lock <length> <amount>
    if (isLock) {
      const cmd = (protocol === 'eth') ? 'lock-eth' : 'lock-btc';
      const wrongArgsMsg = `${error.underline('You must provide an amount argument such as ')}${warning.underline(`yarn ${cmd} 10`)}${error.underline('!')}`;
      const amountErrorMsg = `${error.underline(`Amount "${args[0]}" is not properly formatted, you must submit a number such as `)}${warning.underline(`yarn ${cmd} 10`)}${error.underline('!')}`;
      assert(args.length === 1, wrongArgsMsg);
      assert(!Number.isNaN(Number(args[0])), amountErrorMsg);
    }

    switch (protocol) {
      case 'eth':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
        if (typeof ETH_PRIVATE_KEY === 'undefined' && typeof ETH_KEY_PATH === 'undefined') {
          printNoKeyError('ensure your Ethereum key is formatted under ETH_PRIVATE_KEY or stored as a keystore file under ETH_KEY_PATH');
          process.exit(1);
        } else {
          const key = getEthereumKeyFromEnvVar();
          await eth.lock(key, args[0], args[1], '0x01', LOCKDROP_CONTRACT_ADDRESS, INFURA_PATH);
        }
        break;
      case 'btc':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Bitcoin`);
        if (!program.nativeWallet || (typeof BTC_PRIVATE_KEY_WIF === 'undefined' && typeof BTC_BIP39_MNEMONIC_SEED === 'undefined')) {
          printNoKeyError('ensure your Ethereum key is formatted under BTC_PRIVATE_KEY_WIF, BTC_BIP39_MNEMONIC_SEED, or stored as a keystore file under BTC_BIP38_KEY_PATH');
          process.exit(1);
        } else {
          const keyWIF = getBitcoinKeyFromEnvVar();
          const network = btc.getNetworkSetting(BTC_NETWORK_SETTING);
          const amountToFund = Amount.fromBTC(args[0]);
          const walletId = program.walletID || 'primary';
          const account = program.account || 'default';
          const passphrase = program.passphrase || '';
          const ledgerKeyPurpose = program.ledgerKeyPurpose || 44;
          const ledgerKeyCoinType = program.ledgerKeyCoinType ||  0;
          const ledgerKeyDPath = program.ledgerKeyDPath ||  0;
          const usingLedger = program.ledger;
          console.log(`Ledger: ${usingLedger}, Wallet: ${walletId}, Amount: ${amountToFund.toValue()}, Account: ${account}`)
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
          );
          const result = await btc.lock(
            IPFS_MULTIADDR,
            SUPERNOVA_ADDRESS,
            amountToFund,
            network,
            nodeClient,
            wallet,
            account,
            usingLedger,
            ledgerBcoin,
          )
        }
        break;
      case 'cosmos':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Cosmos`);
        // initialize getters for API
        const quiet = !program.verbose;
        const getters = new Getters(COSMOS_REST_URL, quiet);
        await getters.init();

        // query validator and delegator information to compute locks
        const lockHeight = args[0] || getters.latestHeight;
        const locks = await queryLocks(getters, lockHeight, quiet);
        const lockJson = JSON.stringify(locks, null, 2);
        if (program.output) {
          fs.writeFileSync(program.output, lockJson);
        } else {
          process.stdout.write(lockJson);
        }
        break;
      default:
        console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
        if (typeof ETH_PRIVATE_KEY === 'undefined' && typeof ETH_KEY_PATH === 'undefined') {
          printNoKeyError('ensure your Ethereum key is formatted under ETH_PRIVATE_KEY or stored as a keystore file under ETH_KEY_PATH');
          process.exit(1);
        } else {
          const key = getEthereumKeyFromEnvVar();
          await eth.lock(key, args[0], args[1], '0x01', LOCKDROP_CONTRACT_ADDRESS, INFURA_PATH);
        }
        break;
    }
  });

program.on('--help', () => {
  console.log('');
  console.log('Examples (TODO):');
});

program.parse(process.argv);

if (program.args.length === 0) {
  program.outputHelp();
  process.exit(1);
}

function assert(condition, message) {
    if (!condition) {
        message = error.underline(message || "Assertion failed");
        if (typeof Error !== "undefined") {
            throw new Error(message);
        }
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
    : eth.getPrivateKeyFromEncryptedJson(
        ETH_KEY_PATH,
        ETH_JSON_VERSION,
        ETH_JSON_PASSWORD);
}

function getBitcoinKeyFromEnvVar() {
  if (BTC_PRIVATE_KEY_WIF) {
    return BTC_PRIVATE_KEY_WIF;
  }

  if (BTC_XPRV_KEY) {
    let wif = bip32.fromBase58(BTC_XPRV_KEY).toWIF();
    return wif;
  }

  if (BTC_BIP39_MNEMONIC_SEED) {
    const seed = bip39.mnemonicToSeedSync(BTC_BIP39_MNEMONIC_SEED)
    const wif = bip32.fromSeed(seed).toWIF();
    return wif;
  }
}
