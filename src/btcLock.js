const bitcoin = require('bitcoinjs-lib');
import bip65 from 'bip65';
import bip39 from 'bip39';
import bip38 from 'bip38';
import wif from 'wif';

/**
 * Helper class for storing content in IPFS
 *
 * @class      BtcIPFSLockdropContent Content format wrapper
 */
class BtcIPFSLockdropContent {
  constructor(timeLockScript, comsosAddress) {
    self.timeLockScript = timeLockScript;
    self.comsosAddress = comsosAddress;
  }
}

function idToHash(txid) {
  return Buffer.from(txid, 'hex').reverse();
}

function toOutputScript(address, network) {
  return bitcoin.address.toOutputScript(address, network);
}

/**
 * Lock BTC up in a CTLV P2SH transaction
 *
 * @param      {number}  length                The length in days
 * @param      {number}  amount                The amount of BTC to lock up
 * @param      {string}  comsosAddress         The comsos address
 * @param      {object}  [unspentOutputs=None] The unspent output
 * @param      {object}  [network=None]        The network
 */
export const lock = async (keyWIF, length, amount, comsosAddress, unspentOutputs, changeAddress, changeAmount, network) => {
  if (!network) {
    network = bitcoin.networks.regtest;
  }

  if (!unspentOutputs) {
    return;
  }

  const lockTime = bip65.encode({utc: Math.floor(Date.now() / 1000) + (3600 * 24 * length)});
  const lockTxHex = createlockTx(
    keyWIF,
    lockTime,
    amount,
    comsosAddress,
    unspentOutputs,
    changeAddress,
    changeAmount,
    network);
};

export const createScript = (lockTime, publicKey) => {
  return bitcoin.script.fromASM(`
    ${bitcoin.script.number.encode(lockTime).toString('hex')}
    OP_CHECKLOCKTIMEVERIFY
    OP_DROP
    OP_DUP
    OP_HASH160
    ${bitcoin.crypto.hash160(publicKey).toString('hex')}
    OP_EQUALVERIFY
    OP_CHECKSIG
  `.trim().replace(/\s+/g, ' '))
}

export async function createlockTx(keyWIF, locktime, amount, comsosAddress, unspentOutputs, network, changeAddress=undefined, changeAmount=undefined) {
  const key = bitcoin.ECPair.fromWIF(keyWIF, network);
  const hashType = bitcoin.Transaction.SIGHASH_ALL;
  const redeemScript = createScript(locktime, key.publicKey);
  const { address } = bitcoin.payments.p2sh({
    redeem: {
      output: redeemScript,
      network: network,
    },
    network: network,
  });

  const tx = new bitcoin.Transaction();
  unspentOutputs.forEach(output => {
    if (output.length > 0) {
      let splitOutput = output.split('-');
      tx.addInput(idToHash(splitOutput[0]), Number(splitOutput[1]), 0xfffffffe);
    }
  });
  // Send amount of satoshis to the P2SH time lock transaction
  tx.addOutput(toOutputScript(address, network), Number(amount));
  // Add change address output if exists
  if (changeAddress && changeAddress) {
    console.log('test');
    tx.addOutput(changeAddress, changeAmount);
  }
  // Add OP_RETURN data field with IPFS hash
  // OP_RETURN always with 0 value unless you want to burn coins
  const data = new Buffer(`${comsosAddress}`);
  const dataScript = bitcoin.payments.embed({ data: [data] });
  tx.addOutput(dataScript.output, 0);
  console.log(key);
  tx.signInput(0, key;
  tx.validateSignaturesOfInput(0);
  tx.finalizeAllInputs();
  // Return tx hex
  return tx.extractTransaction().toHex();
}

export async function createUnlockTx(redeemScript, unspent, network) {
  const tx = new bitcoin.Transaction();
  tx.addInput(idToHash(unspent.txId), unspent.vout, 0xfffffffe);
  const signatureHash = tx.hashForSignature(0, redeemScript, hashType);
  const redeemScriptSig = bitcoin.payments.p2sh({
    redeem: {
      input: bitcoin.script.compile([
        bitcoin.script.signature.encode(key.sign(signatureHash), hashType),
        key.publicKey, // CHANGE #2 
      ]),
      output: redeemScript,
      network: network,
    },
    network: network,
  }).input;
  tx.setInputScript(0, redeemScriptSig)
  const txHex = tx.toHex();
  // Return tx hex
  return txHex;
}

export const getPrivateKeyWIFFromEnvVar = (rawWIF, mnemonic, derivationPath, keystorePath, password) => {
  if (rawWIF) return rawWIF;
  if (mnemonic) {
    if (typeof derivationPath === 'undefined') throw new Error('Please specify a derivation path for BIP32 HD keys');
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const node = bip32.fromSeed(seed);
    return node.toWIF();
  }

  if (keystorePath) {
    if (typeof password === 'undefined') throw new new Error('Please specify a decryption password for the keystore data');
    const encryptedKey = fs.readFileSync(keystorePath, 'utf8');
    const decryptedKey = bip38.decrypt(encryptedKey, password, function (status) { console.log(status.percent) });
    return wif.encode(0x80, decryptedKey.privateKey, decryptedKey.compressed)
  }

  throw new Error('No valid BTC key information was provided, please run the CLI with `--help`');
}

export const generateNewMnemonicKeypair = () => {
  return bip39.generateMnemonic();
}

export const generateNewECPairKeypair = () => {
  return bitcoin.ECPair.makeRandom().toWIF();
};

export const getNetworkSetting = (network) => {
  switch (network) {
    case 'regtest':
      return bitcoin.networks.regtest;
    case 'testnet':
      return bitcoin.networks.testnet
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    default:
      return bitcoin.networks.bitcoin;
  }
}