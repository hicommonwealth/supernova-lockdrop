import bitcoin from 'bitcoinjs-lib';

const BTC_PRIVATE_KEY_WIF = process.env.BTC_PRIVATE_KEY_WIF;

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

export async function lock(unspentOutput, length, amount, comsosAddress, network) {
  const hashType = bitcoin.Transaction.SIGHASH_ALL;
  const key = bitcoin.ECPair.fromWIF(BTC_PRIVATE_KEY_WIF);
  const data = new Buffer(`${comsosAddress}`);
  const lockTime = length;
  const redeemScript = createScript(lockTime, key.publicKey);
  const { address } = bitcoin.payments.p2sh({
    redeem: {
      output: redeemScript,
      network: regtest
    },
    network: regtest
  });

  const txb = new bitcoin.TransactionBuilder(regtest)
  txb.addInput(unspent.txId, unspent.vout, 0xfffffffe)
  // Amount in satoshis
  txb.addOutput(address, amount)
  const tx = txb.buildIncomplete()
  const signatureHash = tx.hashForSignature(0, redeemScript, hashType)
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
  }).input
  tx.setInputScript(0, redeemScriptSig)

  await regtestUtils.broadcast(tx.toHex())

  await regtestUtils.verify({
    txId: tx.getId(),
    address: regtestUtils.RANDOM_ADDRESS,
    vout: 0,
    value: 7e4
  })
}