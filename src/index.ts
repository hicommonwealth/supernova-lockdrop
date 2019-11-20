#!/usr/bin/env ts-node
(global as any).window = {};
(global as any).fetch = require("node-fetch");
require('dotenv').config();
import fs from 'fs';
import { Amount } from 'bcoin';
import chalk from 'chalk';
import child_process from 'child_process';
import program from 'commander';
import path from 'path';
import { getNewWalletFromSeed } from '@lunie/cosmos-keys';
import validate from 'bitcoin-address-validation';
import * as btc from './btcLock';
import * as eth from './ethLock';
import * as yaml from 'js-yaml';
import * as secp256k1 from 'secp256k1';
import * as CryptoJS from 'crypto-js';
const bip39 = require('bip39');
import { default as CosmosApi } from '@lunie/cosmos-api';
import throttledQueue from 'throttled-queue';

// CLI Constants
const LOCK_LENGTH = 182; // 182 days
// Bitcoin parameters
const BTC_BIP39_MNEMONIC = process.env.BTC_BIP39_MNEMONIC;
const BTC_NETWORK_SETTING = process.env.BITCOIN_NETWORK_SETTING || 'regtest';
// Bcoin parameters
const BCOIN_WALLET_ID = process.env.BCOIN_WALLET_ID || 'primary';
const BCOIN_WALLET_ACCOUNT = process.env.BCOIN_WALLET_ACCOUNT || 'default';
const BCOIN_WALLET_PASSPHRASE = process.env.BCOIN_WALLET_PASSPHRASE || '';
const BCOIN_NODE_ADDRESS = process.env.BCOIN_NODE_ADDRESS || '127.0.0.1';
const BCOIN_WALLET_NODE_ADDRESS = process.env.BCOIN_WALLET_NODE_ADDRESS || '127.0.0.1';
// IPFS multiaddr
const IPFS_MULTIADDR = process.env.IPFS_MULTIADDR || '/ip4/127.0.0.1/tcp/5002';
// Ethereum parameters
const LOCKDROP_CONTRACT_ADDRESS = process.env.LOCKDROP_CONTRACT_ADDRESS;
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const ETH_KEY_PATH = process.env.ETH_KEY_PATH;
const ETH_JSON_PASSWORD = process.env.ETH_JSON_PASSWORD;
const ETH_JSON_VERSION = process.env.ETH_JSON_VERSION;
// Infura API url
const INFURA_PATH = process.env.INFURA_PATH || 'http://127.0.0.1:8545';
// Cosmos/Supernova
const SUPERNOVA_ADDRESS = process.env.SUPERNOVA_ADDRESS;
const TENDERMINT_URL = process.env.TENDERMINT_URL;
const GAIACLI_PATH = process.env.GAIACLI_PATH || 'gaiacli';
const COSMOS_KEY_PATH = process.env.COSMOS_KEY_PATH;
const COSMOS_REST_URL = process.env.COSMOS_REST_URL;
// Ledger parameters (NOT WORKING)
const LEDGER_KEY_PURPOSE = process.env.LEDGER_KEY_PURPOSE || 44;
const LEDGER_COIN_TYPE = process.env.LEDGER_COIN_TYPE || 0;
const LEDGER_DERIVATION_PATH = process.env.LEDGER_DERIVATION_PATH || 0;
// Stdout coloring
const error = chalk.bold.red;
const warning = chalk.keyword('orange');

const execName = path.basename(process.argv[1]);

// wrapper for exec to get the correct input/output handling
const exec = (cmd, quiet) => {
  if (!quiet) console.log(`Exec: ${cmd}`);
  let result = { success: true, msg: '' };
  let execOutput: string;
  try {
    execOutput = child_process.execSync(cmd, {
      env: process.env,
      stdio: [process.stdin, 'pipe', process.stderr],
      encoding: null,
    });
    result.msg = execOutput.toString();
  } catch (err) {
    if (err.stdout) {
      console.error(err.stdout.toString());
      result.msg = err.stdout.toString();
    } else {
      result.msg = '';
    }
    result.success = false;
    console.error('GAIACLI ERROR, ABORTING.');
  }
  return result;
}

// executes a gaiacli command and parses the result, or else exits
const gaiaExec = (cmd, quiet) => {
  const { msg, success } = exec(cmd, quiet);
  if (!msg || !success) process.exit(1);
  return yaml.safeLoad(msg);
}

const saveOutput = (outputJSON) => {
  if (program.output) {
    fs.writeFileSync(program.output, JSON.stringify(outputJSON));
  } else {
    console.log(error('If you want to save a key to a file, pass in an output file path with -o <filename>'));
    console.log(outputJSON);
  }
}

const cosmosKeyPathExists = () => {
  return fs.existsSync(COSMOS_KEY_PATH);
}

const getCosmosWalletFromEnvVar = () => {
  if (!cosmosKeyPathExists()) {
    console.log(error(`Cannot find file ${COSMOS_KEY_PATH}, aborting.`));
    process.exit(1);
  }
  const data = fs.readFileSync(COSMOS_KEY_PATH, 'utf8');
  const wallet = JSON.parse(data);
  if (!wallet.mnemonic || !wallet.privateKey || !wallet.publicKey || !wallet.cosmosAddress) {
    console.log(error('Malformed Cosmos key file, aborting.'));
    process.exit(1);
  }
  return wallet;
}

const cosmosRestQueue = throttledQueue(1, 200);
const cosmosRestQuery = (path: string, args = {}, retries = 4, page = 1, limit = 30): Promise<any> => {
  return new Promise((resolve, reject) => {
    cosmosRestQueue(async () => {
      const params = Object.assign({ page, limit }, args);
      const paramString = Object.keys(params)
          .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
          .join('&');
      const url = `${COSMOS_REST_URL}${path}?` + paramString;
      const response = await fetch(url);
      if (response.status !== 200) {
        if (retries === 0) {
          reject(`url ${url} failed with status ${response.status}`);
        } else {
          resolve(cosmosRestQuery(path, args, retries - 1, page, limit));
        }
      }
  
      let data = await response.json();
      // remove height wrappers
      if (data.height !== undefined && data.result !== undefined) {
        data = data.result;
      }
      if (Array.isArray(data) && data.length === limit) {
        const nextResults = await this.restQuery(path, args, page + 1);
        resolve(data.concat(nextResults));
      } else {
        resolve(data);
      }
    })
  });
}

const printNoKeyError = (customMsg) => {
  console.log('');
  console.log(`\t${error.underline('You must provide a private key as an environment variable!')}`);
  console.log(`\t${error.underline(`If you use an environment variable, ${customMsg}`)}`)
  console.log('');
}

program.version('1.0.0')
  .name(execName)
  // chains
  .option('--eth', 'Use ETH protocol commands')
  .option('--btc', 'Use BTC protocol commands')
  .option('--cosmos', 'Use Cosmos protocol commands')
  .option('--supernova', 'Use Supernova protocol commands. The only command is to generate an account')

  // actions
  .option('--generate', 'Generate an account/address with the signalled protocol. You must indicate a protocol')
  .option('--lock <amount>', 'Lock some number of tokens using decimal representation')
  .option('--unlock [amount]', 'Unlock tokens using decimal representation (argument used to partial unlock on Cosmos)')
  .option('--query <addressOrTxHash>', 'Query a lock for a given chain with an address or txHash')
  .option('--supernovaAddress <address>', 'Input a supernova address to lock with')

  // additional btc flags
  .option('--usingLedger', 'Flag for signalling use of a compatible Ledger device')
  .option('--walletId <id>', 'A non-default wallet ID for bcoin configuration')
  .option('--walletAccount <account>', 'A non-default wallet account for bcoin configuration')
  .option('--network <network>', 'The BTC network to use: "main", "regtest", etc. The default is "regtest"')
  .option('--nodeAddress <IP address>', 'The BTC node to use. The default is localhost (127.0.0.1)')
  .option('--walletAddress <IP address>', 'The BTC wallet node to use. The default is localhost (127.0.0.1)')

  // additional cosmos/supernova flags
  .option('-m, --recoverMnemonic <mnemonic>', 'An optional mnemonic to generate a Cosmos key file with.')
  .option('-k, --keyName <name>', 'The name of your cosmos key, registered with gaiacli (defaults to mnemonic from COSMOS_KEY_PATH)')
  .option('--validator <address>', 'A cosmos validator, required for lock/unlock')
  .option('--useGaia', 'Use the Gaia CLI to execute the command (for generating keys)')
  .option('--startHeight <height>', 'The block height when the lock period starts, required for --query')
  .option('--endHeight <height>', 'The block height when the lock period ends, required for --query')

  // misc flags
  .option('--supernovaAddress <address>', 'Input a supernova address to lock with')
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
  console.log(error('must provide one of --cosmos, --eth, --btc, --supernova'));
  process.exit(1);
}

if (nMutuallyExclusiveChains > 1) {
  console.log(error('can only provide one chain argument of --cosmos, --eth, --btc, --supernova'));
  process.exit(1);
}

const nMutuallyExclusiveActions = [
  !!program.lock,
  !!program.unlock,
  !!program.generate,
  !!program.query,
].filter((arg) => arg).length;

if (nMutuallyExclusiveActions === 0) {
  console.log(error('must provide one of --lock, --unlock, --generate, --query'))
  process.exit(1);
}
if (nMutuallyExclusiveActions > 1) {
  console.log(error('must only provide one of --lock, --unlock, --generate, --query'));
  process.exit(1);
}

// FUNCTIONALITY
const msg = program.lock
  ? 'to lock on'
  : program.unlock
    ? 'to unlock on'
    : program.generate
      ? 'to generate an address on'
      : program.query
      ? 'to query the lockdrop on'
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
        const result = eth.generateEncryptedWallet(passphrase);
        saveOutput(result);
      } else {
        const key = eth.getEthereumKeyFromEnvVar(ETH_PRIVATE_KEY, ETH_KEY_PATH, ETH_JSON_VERSION, ETH_JSON_PASSWORD);
        const infuraPath = (program.infuraPath) ? program.infuraPath : INFURA_PATH;
        const lockdropContractAddress = (program.lockdropContractAddress) ? program.lockdropContractAddress : LOCKDROP_CONTRACT_ADDRESS;
        const supernovaAddress = (program.supernovaAddress) ? program.supernovaAddress : SUPERNOVA_ADDRESS;

        if (program.lock) {
          if (typeof supernovaAddress === 'undefined') {
            throw new Error('You must specify a supernova address using the flag --supernovaAddress <addr> or specifying it in your .env file');
          }
          console.log(await eth.lock(key, program.lock, lockdropContractAddress, supernovaAddress, infuraPath));
          process.exit(0);
        } else if (program.unlock) {
          console.log(await eth.unlock(key, lockdropContractAddress, infuraPath));
          process.exit(0);
        } else if (program.query) {
          console.log(await eth.getLocksForAddress(program.query, lockdropContractAddress, infuraPath));
          process.exit(0);
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
    const ipfsMultiaddr = (program.ipfsMultiaddr) ? program.ipfsMultiaddr : IPFS_MULTIADDR;
    const supernovaAddress = (program.supernovaAddress) ? program.supernovaAddress : SUPERNOVA_ADDRESS;
    const network = btc.getNetworkSetting((program.network) ? program.network : BTC_NETWORK_SETTING);
    const rpcHost = (program.nodeAddress) ? program.nodeAddress : BCOIN_NODE_ADDRESS;
    const walletHost = (program.walletNodeAddress) ? program.walletNodeAddress : BCOIN_WALLET_NODE_ADDRESS;
    const amountToFund = (program.lock) ? program.lock : '0.0';
    const walletId = (program.walletId) ? program.walletId : BCOIN_WALLET_ID;
    const account = (program.walletAccount) ? program.walletAccount : BCOIN_WALLET_ACCOUNT;
    const passphrase = (program.passphrase) ? program.passphrase : BCOIN_WALLET_PASSPHRASE;
    const ledgerKeyPurpose = (program.ledgerKeyPurpose) ? program.ledgerKeyPurpose : LEDGER_KEY_PURPOSE;
    const ledgerKeyCoinType = (program.ledgerKeyCoinType) ? program.ledgerKeyCoinType : LEDGER_COIN_TYPE;
    const ledgerKeyDPath = (program.ledgerKeyDPath) ? program.ledgerKeyDPath : LEDGER_DERIVATION_PATH;
    const usingLedger = (program.usingLedger) ? program.usingLedger : false;
    const apiKey = program.apiKey || 'test';
    if (program.debug) console.log(`Ledger: ${usingLedger}, Wallet: ${walletId}, Amount: ${amountToFund}, Account: ${account}, Multiaddr: ${ipfsMultiaddr}`)
    const { nodeClient, walletClient } = btc.setupBcoin(network, rpcHost, walletHost, apiKey);
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
      saveOutput(result);
    } else if (program.lock) {
      if (typeof supernovaAddress === 'undefined') {
        throw new Error('You must specify a supernova address using the flag --supernovaAddress <addr> or specifying it in your .env file');
      }
      console.log(`Using bcoin wallet id - ${walletId}, account - ${account} to lock ${amountToFund} BTC`);
      await btc.lock(
        ipfsMultiaddr,
        supernovaAddress,
        Amount.fromBTC(amountToFund),
        network,
        nodeClient,
        wallet,
        account,
        usingLedger,
        ledgerBcoin,
        program.debug
      );
      console.log(error(`A lock-tx.json file has been created in the project directory. Save this for future unlocking!`));
      process.exit(0);
    } else if (program.unlock) {
      await btc.redeem(
        network,
        nodeClient,
        wallet,
        program.debug
      );
      process.exit(0);
    } else if (program.query) {
      let queryObj;
      if (validate(program.query)) {
        queryObj = { address: program.query };
      } else if (program.query.length === 64) {
        queryObj = { txHash: program.query };
      } else {
        throw new Error('You must provide a valid Bitcoin address or transaction hash, both should be 32 bytes maximum');
      }
      console.log(await btc.getTxDataFromIPFS(queryObj, nodeClient, network, ipfsMultiaddr));
      process.exit(0);
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
    if (program.useGaia) {
      // check if gaiacli is available
      const cmd = `${GAIACLI_PATH} version`;
      const { msg, success } = exec(cmd, quiet);
      // TODO: should we check version?
      if (!success || !msg) {
        console.log(error('gaiacli must be installed for cosmos functionality'));
        process.exit(1);
      } else if (!quiet) {
        console.log('Found gaiacli at path: ' + GAIACLI_PATH + ', version: ' + msg);
      }
    }

    // generate cosmos key functionality
    if (program.generate) {
      if (program.useGaia) {
        if (!program.keyName || typeof program.keyName !== 'string') {
          console.log(error('must supply a key name to generate a cosmos address'));
          process.exit(1);
        }

        // TODO: we may want to use the `--no-backup` flag to to avoid displaying the seed
        //   phrase, but then it is lost forever.
        // Note that we would normally decode the output YAML, but it does not print the private key
        //   nor is the mnemonic part of the YAML output. The inceased difficulty of parsing means
        //   we do not create a key file with the output, we simply print it.
        const cmd = `${GAIACLI_PATH} keys add ${program.keyName}`;
        const { msg } = exec(cmd, quiet);
        console.log(msg);
      } else {
        let mnemonic;
        if (program.recoverMnemonic) {
          mnemonic = program.recoverMnemonic;
        } else {
          mnemonic = bip39.generateMnemonic(256);
        }
        const {privateKey, publicKey, cosmosAddress } = getNewWalletFromSeed(mnemonic);
        saveOutput({ mnemonic, privateKey, publicKey, cosmosAddress });
      }
    } else if (program.query) {
      let delegatorAddress: string;
      if (typeof program.query !== 'boolean') {
        // TODO: what if they provide a TX hash? we should error
        delegatorAddress = program.query;
      } else {
        const { cosmosAddress } = getCosmosWalletFromEnvVar();
        delegatorAddress = cosmosAddress;
      }

      // We could theoretically use gaia, but it lacks the /staking/delegators/XXX/validators query (!!!)
      if (program.useGaia) {
        console.log(error('cannot perform delegation query with gaiacli'));
        process.exit(1);
      }

      if (!program.startHeight || !program.endHeight) {
        console.log(error('must provide start and end height for cosmos query'));
        process.exit(1);
      }
      const startHeight = +program.startHeight;
      const endHeight = +program.endHeight;

      const { block_meta: { header: { height } } } = await cosmosRestQuery(`/blocks/latest`);
      if (endHeight > +height) {
        console.log(error('query endHeight cannot be in future'));
        process.exit(1)
      }

      // generate the N heights where we plan to query
      const nQueryPoints = 5;
      const queryPeriod = Math.floor((endHeight - startHeight) / (nQueryPoints - 1));
      const queryHeights: number[] = [...new Array(nQueryPoints)]
        .map((dummy, idx) => startHeight + (idx * queryPeriod));

      const { unbonding_time, bond_denom } = await cosmosRestQuery(`/staking/parameters`);
      // unbonding_time is in ns, so slice off the last 9 digits to get it in seconds
      const unbondingTimeSeconds = +(unbonding_time.slice(0, unbonding_time.length - 8));
      // assuming 5 second block times
      const unbondingBlocks = unbondingTimeSeconds / 5;
      if (queryPeriod > unbondingBlocks) {
        console.log(`query period: ${queryPeriod}, unbonding blocks: ${unbondingBlocks}`);
        console.log(error('must sample more blocks to avoid missing unbonding events'));
        process.exit(1);
      }
      
      // for each height, fetch delegations at the time + validator share conversions
      if (!quiet) console.log(`Querying for ${nQueryPoints} delegations between ${startHeight} and ${endHeight}!`);
      const tokensAtPoints = await Promise.all(queryHeights.map(async (height) => {
        const delegations: any[] = await cosmosRestQuery(`/staking/delegators/${delegatorAddress}/delegations`, { height });
        const validators: any[] = await cosmosRestQuery(`/staking/delegators/${delegatorAddress}/validators`, { height });

        // construct conversion ratios for validator shares to tokens
        const validatorStakeRatios = {};
        for (const v of validators) {
          validatorStakeRatios[v.operator_address] = (+v.tokens) / (+v.delegator_shares);
        }

        // convert delegations to their values in tokens
        const delegatorValue: number = delegations.reduce((sum, { validator_address, shares }) => {
          return sum + (validatorStakeRatios[validator_address] * (+shares));
        }, 0);
        if (!quiet) console.log(`  Found total delegation of ${delegatorValue}${bond_denom} at height ${height}.`);
        return delegatorValue;
      }));

      // average tokens at all points to obtain effective lock value
      const effectiveLockValue = tokensAtPoints.reduce((avg, value) => {
        return avg + (value / nQueryPoints);
      }, 0);
      console.log(`\nEffective delegation between ${startHeight} and ${endHeight}: ${effectiveLockValue}${bond_denom}`);
    } else {
      if (!program.validator) {
        console.log(error('must provide --validator to lock or unlock on cosmos'));
      }

      // check if tendermint node is available and fetch chain-id and denomination
      const genesisResp = await fetch(TENDERMINT_URL + '/genesis');
      if (!genesisResp.ok) {
        console.log(error('failed to communicate with tendermint node'));
        process.exit(1);
      }
      const genesis = await genesisResp.json();
      const chainId = genesis.result.genesis.chain_id;
      const denom = genesis.result.genesis.app_state.staking.params.bond_denom;
      const supernovaAddress = (program.supernovaAddress) ? program.supernovaAddress : SUPERNOVA_ADDRESS;

      if (program.useGaia) {
        // TODO: accept a key path for gaiacli and feed in mnemonic to stream
        let from = program.keyName;
        if (!program.keyName) {
          if (cosmosKeyPathExists()) {
            const { cosmosAddress } = getCosmosWalletFromEnvVar();
            from = cosmosAddress;
          } else {
            console.log(error('must provide --keyName or COSMOS_KEY_PATH to lock/unlock with gaiacli'));
            process.exit(1);
          }
        }
        if (program.unlock && typeof program.unlock === 'boolean') {
          console.log(error('must provide unlock amount (in stake) on cosmos'));
          process.exit(1);
        }
        const amount = program.lock || program.unlock;
        const cmd = `${GAIACLI_PATH} tx staking ${amount.lock ? 'delegate': 'unbond'} --from ${from} ` +
          `--node ${TENDERMINT_URL} --chain-id ${chainId} ` +
          `${program.validator} ${amount}${denom} -y`;
        const { txhash } = gaiaExec(cmd, quiet);
        console.log(`Transaction sent successfully with hash ${txhash}.`);

        // NOTE: the below commented-out code does not work, because we need to wait for the tx to be included in a block once
        //   it has been verified by the node. We could fix it by doing something similar to `queryTxInclusion` in the cosmos-api,
        //   but for now we'll just print the hash instead.
        // once we retrieve the tx hash, we need to do an additional query to verify the information
        //const txQueryResult = exec(`${GAIACLI_PATH} query tx ${txhash} --node ${TENDERMINT_URL} --chain-id ${chainId}`, quiet);
        //const { height, timestamp } = yaml.safeLoad(txQueryResult.msg);
        //console.log(`${program.lock ? 'Locked' : 'Unlocked'} ${amount}${denom} with ${program.validator} at height: ${height}, time: ${timestamp}`)
      } else {
        // use lunie/cosmos-api
        if (!cosmosKeyPathExists()) {
          console.log(error('COSMOS_KEY_PATH does not exist. please generate an address.'));
          process.exit(1);
        }
        const { privateKey, publicKey, cosmosAddress } = getCosmosWalletFromEnvVar();
        const cosmos = new CosmosApi(COSMOS_REST_URL, chainId);
        let msg;
        const amount = '' + (program.lock || program.unlock);
        const validatorAddress = program.validator;
        if (program.lock) {
          if (typeof supernovaAddress === 'undefined') {
            throw new Error('You must specify a supernova address using the flag --supernovaAddress <addr> or specifying it in your .env file');
          }

          msg = cosmos.MsgDelegate(cosmosAddress, { validatorAddress, amount, denom });
        } else {
          msg = cosmos.MsgUndelegate(cosmosAddress, { validatorAddress, amount, denom });
        }
        // memo can be anything
        const memo = program.lock ? JSON.stringify({ supernovaAddress }) : '';
        const gasEstimate = await msg.simulate({ memo });
        // TODO: add ledger support
        const signer = async (msgToSign: string) => {
          // we use the direct crypto here rather than the library because of a strange bug involving
          // buffer types -- this is the exact code from `signMessage` in @lunie/cosmos-keys.
          const signHash = Buffer.from(CryptoJS.SHA256(msgToSign).toString(), 'hex');
          const { signature } = secp256k1.sign(signHash, Buffer.from(privateKey, 'hex'));
          return { signature, publicKey: Buffer.from(publicKey, 'hex') };
        };
        const { included } = await msg.send({ gas: gasEstimate.toString(), memo }, signer);
        try {
          const { height, timestamp } = await included();
          console.log(`${program.lock ? 'Locked' : 'Unlocked'} ${amount}${denom} with ${validatorAddress} at height: ${height}, time: ${timestamp}`)
        } catch (err) {
          console.log(error('failed to send tx: ' + JSON.stringify(err)));
          process.exit(1);
        }
      }
    }
  })();
}

if (program.supernova) {
  const quiet = !program.verbose;

  if (program.useGaia) {
    // check if gaiacli is available
    const { msg, success } = exec(`${GAIACLI_PATH} version`, quiet);
    // TODO: should we check version?
    if (!success || !msg) {
      console.log(error('gaiacli must be installed for cosmos functionality'));
      process.exit(1);
    } else if (!quiet) {
      console.log('Found gaiacli at path: ' + GAIACLI_PATH + ', version: ' + msg);
    }
  }

  // generate cosmos key functionality
  if (program.generate) {
    if (program.useGaia) {
      if (!program.keyName || typeof program.keyName !== 'string') {
        console.log(error('must supply a key name to generate a cosmos address'));
        process.exit(1);
      }
      // TODO: we may want to use the `--no-backup` flag to to avoid displaying the seed
      //   phrase, but then it is lost forever.
      const { msg } = exec(`${GAIACLI_PATH} keys add ${program.keyName}`, quiet);
      console.log(msg);
    } else {
      const mnemonic = bip39.generateMnemonic(256);
      const {privateKey, publicKey, cosmosAddress } = getNewWalletFromSeed(mnemonic);
      saveOutput({ mnemonic, privateKey, publicKey, supernovaAddress: cosmosAddress });
    }
  }
}
