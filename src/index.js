#!/usr/bin/env ts-node
require('dotenv').config();
import fs from 'fs';
import program from 'commander';
import path from 'path';
import chalk from 'chalk';
import { version } from '../package.json';
import * as atom from './atomLock';
import * as btc from './btcLock';
import * as eth from './ethLock';
import * as ipfsUtil from './ipfsUtil';

// CLI Constants
const LOCK_LENGTH = 31; // 31 days
// Bitcoin
const BTC_PRIVATE_KEY_WIF = process.env.BTC_PRIVATE_KEY_WIF;
const BTC_BIP38_KEY_PATH = process.env.BTC_BIP38_KEY_PATH;
const BTC_BIP38_PASSWORD = process.env.BTC_BIP38_PASSWORD;
const BTC_BIP39_MNEMONIC_SEED = process.env.BTC_BIP39_MNEMONIC_SEED;
const BTC_BIP32_DERIVATION_PATH = process.env.BTC_BIP32_DERIVATION_PATH;
const BTC_UTXOS = process.env.BTC_UTXOS.split(',');
const BTC_NETWORK_SETTING = process.env.BITCOIN_NETWORK_SETTING || 'regtest';
const BTC_CHANGE_ADDRESS = process.env.BTC_CHANGE_ADDRESS;
const BTC_CHANGE_AMOUNT = process.env.BTC_CHANGE_AMOUNT;
// IPFS multiaddr
const IPFS_REMOTE_URL = process.env.IPFS_REMOTE_URL;
// Ethereum constants
const LOCKDROP_CONTRACT_ADDRESS = process.env.LOCKDROP_CONTRACT_ADDRESS;
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const ETH_KEY_PATH = process.env.ETH_KEY_PATH;
const ETH_JSON_PASSWORD = process.env.ETH_JSON_PASSWORD;
const ETH_JSON_VERSION = process.env.ETH_JSON_VERSION;
// Infura API url
const INFURA_PATH = process.env.INFURA_PATH;
// Stdout coloring
const error = chalk.bold.red;
const warning = chalk.keyword('orange');

const execName = path.basename(process.argv[1]);
program.version(version)
  .name(execName)
  .usage('<protocol> <function> [ARGS...]')
  .arguments('<protocol> <func> [args...]')
  .option('--test', 'Test out some functionality')
  .action(async (protocol, func, args) => {
    console.log(program.test);

    console.log(`Protocol: ${protocol}, function: ${func}, args: ${args}`)
    const isLock = (func === 'lock');
    const msg = `${(isLock) ? 'to lock on' : 'to query the lockdrop on'}`;

    // If isLock, then the arguments should be <protocol> lock <length> <amount>
    if (isLock) {
      const cmd = (protocol === 'eth') ? 'lock-eth' : 'lock-btc';
      const wrongArgsMsg = `${error.underline('You must provide both length and amount arguments such as ')}${warning.underline(`yarn ${cmd} 10 10`)}${error.underline('!')}`;
      const lengthErrorMsg = `${error.underline(`Length "${args[0]}" is not properly formatted, you must submit a number such as `)}${warning.underline(`yarn ${cmd} 10 10`)}${error.underline('!')}`;
      const amountErrorMsg = `${error.underline(`Amount "${args[1]}" is not properly formatted, you must submit a number such as `)}${warning.underline(`yarn ${cmd} 10 10`)}${error.underline('!')}`;
      assert(args.length === 2, wrongArgsMsg);
      assert(!Number.isNaN(Number(args[0])), lengthErrorMsg);
      assert(!Number.isNaN(Number(args[1])), amountErrorMsg);
    }

    switch (protocol) {
      case 'eth':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
        if (typeof ETH_PRIVATE_KEY === 'undefined' && typeof ETH_KEY_PATH === 'undefined') {
          printNoKeyError('ensure your Ethereum key is formatted under ETH_PRIVATE_KEY or stored as a keystore file under ETH_KEY_PATH');
          process.exit(1);
        } else {
          const key = getEthereumKeyFromEnvVar();
          await eth.lock(key, args[0], args[1], '0x01', remoteUrl=INFURA_PATH);
        }
        break;
      case 'btc':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Bitcoin`);
        if (typeof BTC_PRIVATE_KEY_WIF === 'undefined' && typeof BTC_BIP38_KEY_PATH === 'undefined' && typeof BTC_BIP39_MNEMONIC_SEED === 'undefined') {
          printNoKeyError('ensure your Ethereum key is formatted under BTC_PRIVATE_KEY_WIF, BTC_BIP39_MNEMONIC_SEED, or stored as a keystore file under BTC_BIP38_KEY_PATH');
          process.exit(1);
        } else {
          const key = getBitcoinKeyFromEnvVar();
          const network = btc.getNetworkSetting(BTC_NETWORK_SETTING);
          const changeAddress = BTC_CHANGE_ADDRESS;
          await btc.lock(key, args[0], args[1], '0x01', BTC_UTXOS, network);
        }
        break;
      default:
        console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
        if (typeof ETH_PRIVATE_KEY === 'undefined' && typeof ETH_KEY_PATH === 'undefined') {
          printNoKeyError('ensure your Ethereum key is formatted under ETH_PRIVATE_KEY or stored as a keystore file under ETH_KEY_PATH');
          process.exit(1);
        } else {
          const key = getEthereumKeyFromEnvVar();
          await eth.lock(key, args[0], args[1], '0x01', remoteUrl=INFURA_PATH);
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
  return btc.getPrivateKeyWIFFromEnvVar(
    BTC_PRIVATE_KEY_WIF,
    BTC_BIP39_MNEMONIC_SEED,
    BTC_BIP32_DERIVATION_PATH,
    BTC_BIP38_KEY_PATH,
    BTC_BIP38_PASSWORD);
}
