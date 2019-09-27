import bitcoin from 'bitcoinjs-lib';
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

/**
 * Lock BTC up in a CTLV P2SH transaction
 *
 * @param      {number}  length                The length in days
 * @param      {number}  amount                The amount of BTC to lock up
 * @param      {string}  comsosAddress         The comsos address
 * @param      {object}  [unspentOutput=None]  The unspent output
 * @param      {object}  [network=None]        The network
 */
export const lock = async (length, amount, comsosAddress, unspentOutput=None, network=None) => {
  if (!network) {
    network = bitcoin.networks.regtest;
  }

  if (!unspentOutput) {
    return;
  }

  const lockTime = bip65.encode({utc: Math.floor(Date.now() / 1000) + (3600 * 24 * length)});
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

export async function createlockTx(keyWIF, length, amount, comsosAddress, unspentOutput, network) {
  const key = bitcoin.ECPair.fromWIF(keyWIF);
  const hashType = bitcoin.Transaction.SIGHASH_ALL;
  const lockTime = length;
  const redeemScript = createScript(lockTime, key.publicKey);
  const { address } = bitcoin.payments.p2sh({
    redeem: {
      output: redeemScript,
      network: network
    },
    network: network
  });

  const txb = new bitcoin.TransactionBuilder(network);
  txb.addInput(unspent.txId, unspent.vout, 0xfffffffe);
  // Send amount of satoshis to the P2SH time lock transaction
  txb.addOutput(address, amount);
  // Add OP_RETURN data field with IPFS hash
  // OP_RETURN always with 0 value unless you want to burn coins
  const data = new Buffer(`${comsosAddress}`);
  const dataScript = bitcoin.payments.embed({ data: [data] });
  txb.addOutput(dataScript.output, 0);
  const tx = txb.buildIncomplete();
  const signatureHash = tx.hashForSignature(0, redeemScript, hashType);
  txb.sign(0, key);

  const txRaw = txb.build();
  const txHex = txRaw.toHex();
  // Return tx hex
  return txHex;
}

export async function createUnlockTx(redeemScript, network) {
  const txb = new bitcoin.TransactionBuilder(network);
  txb.addInput(unspent.txId, unspent.vout, 0xfffffffe);
  const tx = txb.buildIncomplete();
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

export const getPrivateKeyWIFFromEnvVar(rawWIF, mnemonic, derivationPath, keystorePath, password) {
  if (rawWIF) return rawWIF;
  if (mnemonic) {
    if (typeof derivationPath === 'undefined') {
      throw new Error('Please specify a derivation path for BIP32 HD keys');
    } else {
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const node = bip32.fromSeed(seed);
      return node.toWIF();
    }
  }

  if (keystorePath) {
    const encryptedKey = fs.readFileSync(keystorePath, 'utf8');
    const decryptedKey = bip38.decrypt(encryptedKey, password, function (status) {
      console.log(status.percent) // will print the percent every time current increases by 1000
    });
    return wif.encode(0x80, decryptedKey.privateKey, decryptedKey.compressed)
  }
}

export const generateNewMnemonicKeypair = () => {
  return bip39.generateMnemonic();
}

export const generateNewECPairKeypair = () => {
  return bitcoin.ECPair.makeRandom().toWIF();
};