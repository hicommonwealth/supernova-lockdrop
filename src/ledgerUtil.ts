import { Coin, KeyRing, MTX, TX } from 'bcoin';
import * as btc from './btcLock';
import bledger from 'bledger';
import Logger from 'blgr';
import assert from 'assert';

export const getLedgerBcoin = async (network) => {
  const { LedgerBcoin } = bledger;
  // Setup logging for ledger
  const logger = new Logger({
    console: true,
    level: 'info'
  });
  const { Device } = bledger.USB;
  // get first device available.
  const device = await Device.requestDevice();
  device.set({
    timeout: 10000,
    logger,
  });
  // open device and return the object afterwards
  await device.open();
  const ledgerBcoin = new LedgerBcoin({ device, network, logger });
  return ledgerBcoin;
}

export const getLedgerHD = async (ledgerBcoin, accountPath) => {
  return await ledgerBcoin.getPublicKey(accountPath);
};

export const getWalletFromLedger = async (ledgerBcoin, accountPath, network, walletClient, walletId, password) => {
  let wallet;
  // first grab device if we are using the ledger
  const hd = await getLedgerHD(ledgerBcoin, accountPath);
  try {
    const options = {
      passphrase: password,
      witness: true,
      watchOnly: true,
      accountKey: hd.xpubkey(network),
    };
  
    wallet = await walletClient.createWallet(walletId, options);
  } catch (e) {
    wallet = walletClient.wallet(walletId);
  }
  return wallet;
}

export const sendTxUsingLedger = async (ledgerBcoin, wallet, outputs, account, amountToFund, keyring) => {
  const { LedgerTXInput } = bledger;
  // create mutable tx
  let mtx = new MTX();
  // add outputs
  outputs.forEach(o => {
    mtx.addOutput(o);
  });
  // get coins from the watch only wallet
  const coins = await wallet.getCoins();
  const change = await wallet.createChange(account);
  // collect only necessary coins
  let ledgerInputs = [];
  let ledgerCoins = [];
  const amount = Number(amountToFund.toValue());
  let runningAmount = 0;
  for (const coin of coins) {
    if (runningAmount >= amount) break;
    runningAmount += coin.value;
    const result = await wallet.getTX(coin.hash);
    // console.log('\n\n');
    // console.log(result);
    // console.log('\n\n');
    let txFromRaw = TX.fromRaw(Buffer.from(result.tx, 'hex'));
    console.log(txFromRaw)
    result.outputs.forEach((out, inx) => {
      // console.log('Out')
      // console.log(out);
      // console.log('\n')
      if (out.value > 0) {
        const ledgerInput = new LedgerTXInput({
          witness: true,
          tx: txFromRaw,
          index: inx,
          redeem: txFromRaw.outputs[inx].script,
          path: out.path.derivation,
          publicKey: keyring.publicKey,
        });
        ledgerInputs.push(ledgerInput);
      }
    });

    ledgerCoins.push(Coin.fromJSON(coin));
    
  }
  console.log(ledgerCoins);
  // fund tx with coins, use change address for leftover
  await mtx.fund(ledgerCoins, {
    changeAddress: change.address,
  });

  ledgerCoins.forEach((coin, inx) => {
    mtx.scriptInput(inx, coin, keyring)
  });

  console.log('MTX');
  console.log(mtx);
  // const result = await mtx.check();
  const result = await ledgerBcoin.signTransaction(mtx, ledgerInputs);
  // const sigs = await ledgerBcoin.getTransactionSignatures(mtx, mtx.view, ledgerInputs);
  // const inputs = mtx.inputs;
  // console.log(inputs);
  // console.log('test')
  // inputs.forEach((input, inx) => {
  //   const stack = input.witness.toStack();
  //   // let's get the signature and replace the placeholder
  //   // in the stack. We can use the MTX `signature` method
  //   stack.setData(0, sigs[inx]);
  
  //   stack.setData(1, keyring.getPublicKey());
  //   console.log(input);
  //   console.log('ere')
  //   input.witness.fromStack(stack);
  //   console.log(input);
  //   mtx.inputs[inx] = input;
  // });
  // console.log(mtx.inputs[0]);
  console.log(result);
  assert(mtx.verify(), 'TX did not verify successfully');
  return {};
};
