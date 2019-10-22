#!/usr/bin/env ts-node
require('dotenv').config();
import fs from 'fs';
import program from 'commander';
import path from 'path';
import chalk from 'chalk';
import child_process from 'child_process';
import * as btc from './btcLock';
import * as eth from './ethLock';
import { Amount } from 'bcoin';

// CLI Constants
const LOCK_LENGTH = 182; // 182 days
// Bitcoin parameters
const BTC_BIP39_MNEMONIC = process.env.BTC_BIP39_MNEMONIC;
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
const COSMOS_TENDERMINT_URL = process.env.COSMOS_TENDERMINT_URL || 'http://149.28.47.49:26657';
const GAIACLI_PATH = process.env.GAIACLI_PATH || 'gaiacli';
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
  // chains
  .option('--eth', 'Use ETH protocol commands')
  .option('--btc', 'Use BTC protocol commands')
  .option('--cosmos', 'Use Cosmos protocol commands')
  .option('--supernova', 'Use Supernova protocol commands. The only command is to generate an account')
  
  // actions
  .option('--generate [keyName]', 'Generate an account/address with the signalled protocol. You must indicate a protocol')
  .option('--lock <amount>', 'Lock some number of tokens using decimal representation')
  .option('--unlock [amount]', 'Unlock tokens using decimal representation (argumed used to partial unlock on Cosmos)')

  // additional btc flags
  .option('--nativeWallet', 'Flag for signalling use of the native Bcoin wallet')
  .option('--usingLedger', 'Flag for signalling use of a compatible Ledger device')
  .option('--walletId', 'A non-default wallet ID for bcoin configuration')
  .option('--walletAccount', 'A non-default wallet account for bcoin configuration')

  // additional cosmos flags
  .option('--validator <address>', 'The cosmos validator to lock or unlock with')
  .option('--keyName <name>', 'The name of your cosmos key, as registered with gaiacli')
  .option('--dryRun', 'Simulate the cosmos transaction but do not broadcast')

  // misc flags
  .option('-o, --output <filename>', 'Specify an output file for address or lock data')
  .option('-d, --debug', 'Turn full debug logs on')
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

// ARGUMENT VALIDATION
const nMutuallyExclusiveChains = [
  program.cosmos,
  program.eth,
  program.btc,
  program.supernova,
].filter((arg) => arg).length;

if (nMutuallyExclusiveChains === 0) {
  console.log(error('must provide either --cosmos, --eth, --btc, or --supernova'));
  process.exit(1);
}

if (nMutuallyExclusiveChains > 1) {
  console.log(error('can only provide one chain argument out of --cosmos, --eth, --btc, and --supernova'));
  process.exit(1);
}

const nMutuallyExclusiveActions = [
  !!program.lock,
  !!program.unlock,
  !!program.generate,
].filter((arg) => arg).length;

if (nMutuallyExclusiveActions === 0) {
  console.log(error('must provide either, --lock, --unlock, or --generate'))
  process.exit(1);
}
if (nMutuallyExclusiveActions > 1) {
  console.log(error('must only provide one of --lock, --unlock, --generate'));
  process.exit(1);
}

// FUNCTIONALITY
const msg = program.lock
  ? 'to lock on'
  : program.unlock
    ? 'to unlock on'
    : program.generate
      ? 'to generate an address on'
      : 'INVALID';

if (program.eth) {
  (async () => {
    console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
    if (typeof ETH_PRIVATE_KEY !== 'undefined' || 
         (typeof ETH_KEY_PATH !== 'undefined' &&
          typeof ETH_JSON_PASSWORD !== 'undefined' &&
          typeof ETH_JSON_VERSION !== 'undefined')
    ) {
      const passphrase = program.passphrase || ETH_JSON_PASSWORD;
      if (program.generate) {
        const result = eth.generateEncryptedWallet(passphrase)
        if (program.output) {
          fs.writeFileSync(program.output, JSON.stringify(result));
        } else {
          console.log(error('If you want to save a key to a file, pass in an output file path with -o <filename>'));
          console.log(result);
        }
      } else {
        const key = getEthereumKeyFromEnvVar();
        const infuraPath = program.infuraPath || INFURA_PATH;
        const lockdropContractAddress = program.lockdropContractAddress || LOCKDROP_CONTRACT_ADDRESS;
        const supernovaAddress = program.supernovaAddress || SUPERNOVA_ADDRESS;

        if (program.lock) {
          return await eth.lock(key, program.lock, supernovaAddress, lockdropContractAddress, infuraPath);
        } else if (program.unlock) {
          return await eth.unlock(key, lockdropContractAddress, infuraPath);
        } else {
          console.log(error('invalid action'));
          process.exit(1);
        }
      }
    } else {
      printNoKeyError('ensure your Ethereum key is formatted under ETH_PRIVATE_KEY or stored as a keystore file under ETH_KEY_PATH');
      process.exit(1);
    }
  })();
}

if (program.btc) {
  (async () => {
    console.log(`Using the Supernova Lockdrop CLI ${msg} Bitcoin`);
    const ipfsMultiaddr = program.ipfsMultiaddr || IPFS_MULTIADDR;
    const supernovaAddress = program.supernovaAddress || SUPERNOVA_ADDRESS;
    const network = btc.getNetworkSetting(BTC_NETWORK_SETTING);
    const amountToFund = program.lock || '0';
    const walletId = program.walletID || BCOIN_WALLET_ID;
    const account = program.walletAccount || BCOIN_WALLET_ACCOUNT;
    const passphrase = program.passphrase || BCOIN_WALLET_PASSPHRASE;
    const ledgerKeyPurpose = program.ledgerKeyPurpose || LEDGER_KEY_PURPOSE;
    const ledgerKeyCoinType = program.ledgerKeyCoinType || LEDGER_COIN_TYPE;
    const ledgerKeyDPath = program.ledgerKeyDPath || LEDGER_DERIVATION_PATH;
    const usingLedger = program.usingLedger || false;
    const apiKey = program.apiKey || 'test';
    console.log(`Ledger: ${usingLedger}, Wallet: ${walletId}, Amount: ${amountToFund}, Account: ${account}, Multiaddr: ${ipfsMultiaddr}`)
    const { nodeClient, walletClient } = btc.setupBcoin(network, apiKey);
    const { wallet, ledgerBcoin } = await btc.getBcoinWallet(
      usingLedger,
      walletId,
      network,
      walletClient,
      ledgerKeyPurpose,
      ledgerKeyCoinType,
      ledgerKeyDPath,
      passphrase,
      BTC_BIP39_MNEMONIC,
    );

    if (program.generate) {
      const result = await btc.createOrGetAccount(wallet, account);
      if (program.output) {
        fs.writeFileSync(program.output, JSON.stringify(result));
      } else {
        console.log(error('If you want to save a key to a file, pass in an output file path with -o <filename>'));
        console.log(result);
      }
    } else if (program.lock) {
      return await btc.lock(
        ipfsMultiaddr,
        supernovaAddress,
        Amount.fromBTC(amountToFund),
        network,
        nodeClient,
        wallet,
        account,
        usingLedger,
        ledgerBcoin,
        program.debug);
    } else if (program.unlock) {
      return await btc.redeem(
        network,
        nodeClient,
        wallet,
        program.debug
      );
    } else {
      console.log(error('invalid action'));
      process.exit(1);
    }
  })();
}

if (program.cosmos) {
  (async () => {
    const quiet = !program.verbose;

    console.log(`Using the Supernova Lockdrop CLI ${msg} Cosmos`);
    if (program.output) {
      console.log(warning('cosmos does not support the --output flag, ignoring'));
    }

    // wrapper for exec to get the correct input/output handling
    const exec = (cmd) => {
      if (!quiet) console.log(`Exec: ${cmd}`);
      return child_process.execSync(cmd, {
        env: process.env,
        stdio: [process.stdin, 'pipe', process.stderr],
        encoding: null,
      });
    }

    // check if gaiacli is available
    const version = exec(`${GAIACLI_PATH} version`);
    // TODO: should we check version?
    if (!version) {
      console.log(error('gaiacli must be installed for cosmos functionality'));
      process.exit(1);
    } else if (!quiet) {
      console.log('Found gaiacli at path: ' + GAIACLI_PATH + ', version: ' + version);
    }

    // functionality
    if (program.generate) {
      if (typeof program.generate !== 'string') {
        console.log(error('must supply a key name to generate a cosmos address'));
        process.exit(1);
      }
      // TODO: we may want to use the `--no-backup` flag to to avoid displaying the seed
      //   phrase, but then it is lost forever.
      const result = exec(`${GAIACLI_PATH} keys add ${program.generate}`);
      console.log(result);
    } else {
      if (!program.keyName) {
        console.log(error('must provide gaiacli --keyName to lock or unlock on cosmos'));
        process.exit(1);
      }
      if (!program.validator) {
        console.log(error('must provide --validator to lock or unlock on cosmos'));
      }
      // TODO: should we move some of these arguments into the env file?
      if (program.lock) {
        const result = exec(
          `${GAIACLI_PATH} tx staking delegate --from ${program.keyName} ` +
          `--node ${COSMOS_TENDERMINT_URL} --trust-node ` +
          `${program.validator} ${program.lock}stake ` +
          program.dryRun ? '--dry-run ' : ''
        );
        // TODO: handle results
        console.log(result);
      } else if (program.unlock) {
        if (typeof program.unlock === 'boolean') {
          console.log(error('must provide unlock amount (in stake) on cosmos'));
          process.exit(1);
        }
        const result = exec(
          `${GAIACLI_PATH} tx staking unbond --from ${program.keyName} ` +
          `--node ${COSMOS_TENDERMINT_URL} --trust-node ` +
          `${program.validator} ${program.unlock}stake ` +
          program.dryRun ? '--dry-run ' : ''
        );
        // TODO: handle results
        console.log(result);
      }
    }
  })();
}
