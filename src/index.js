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

const error = chalk.bold.red;
const warning = chalk.keyword('orange');

const execName = path.basename(process.argv[1]);
program.version(version)
  .name(execName)
  .usage('<protocol> <function> [ARGS...]')
  .arguments('<protocol> <func> [args...]')
  .action(async (protocol, func, args) => {
    if (typeof program.seed === 'undefined' && typeof process.env.SEED === 'undefined') {
      console.log('');
      console.log(`\t${error.underline('You must provide a private key seed as a CLI argument or as environment variable!')}`);
      console.log('');
      return;
    }

    const isLock = (func === 'lock');
    const msg = `${(isLock) ? 'to lock on' : 'to query the lockdrop on'}`;

    // If isLock, then the arguments should be <protocol> lock <length> <amount>
    if (isLock) {
      const cmd = (protocol === 'eth' || protocol === 'ethereum' || protocol === 'ETH') ? 'lock-eth'
        : (protocol === 'btc' || protocol === 'bitcoin' || protocol === 'BTC') ? 'lock-btc'
          : 'lock-atom';
      const wrongArgsMsg = `${error.underline('You must provide both length and amount arguments such as ')}${warning.underline(`yarn ${cmd} 10 10 -s <seed>`)}${error.underline('!')}`;
      const lengthErrorMsg = `${error.underline(`Length "${args[0]}" is not properly formatted, you must submit a number such as `)}${warning.underline(`yarn ${cmd} 10 10 -s <seed>`)}${error.underline('!')}`;
      const amountErrorMsg = `${error.underline(`Amount "${args[1]}" is not properly formatted, you must submit a number such as `)}${warning.underline(`yarn ${cmd} 10 10 -s <seed>`)}${error.underline('!')}`;
      assert(args.length === 2, wrongArgsMsg);
      assert(!Number.isNaN(Number(args[0])), lengthErrorMsg);
      assert(!Number.isNaN(Number(args[1])), amountErrorMsg);
    }

    switch (protocol) {
      case 'eth' | 'ethereum' | 'ETH':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
        break;
      case 'btc' | 'bitcoin' | 'BTC':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Bitcoin`);
        break;
      case 'atom' | 'cosmos':
        console.log(`Using the Supernova Lockdrop CLI ${msg} Atom/Cosmos`);
        break;
      default:
        console.log(`Using the Supernova Lockdrop CLI ${msg} Ethereum`);
        break;
    }
  })
  .option('-s, --seed <hexSeed>', 'A seed to sign transactions with, targetting the desired protocol');

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