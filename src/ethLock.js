import Web3, { utils } from 'web3';
import HDWalletProvider from "truffle-hdwallet-provider";
import EthereumTx from 'ethereumjs-tx';
import jswallet from 'ethereumjs-wallet';
import fs from 'fs';

const { toBN, fromWei } = utils;
const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./eth/build/contracts/Lockdrop.json').toString());
const LOCALHOST_URL = 'http://localhost:8545';

export function getWeb3(remoteUrl, key) {
  let provider;
  if (key) {
    provider = new HDWalletProvider(key, remoteUrl);
  } else {
    provider = new Web3.providers.HttpProvider(remoteUrl);
  }
  const web3 = new Web3(provider);
  return web3;
}

export async function lock(key, amount, lockdropContractAddress, supernovaAddress, remoteUrl=LOCALHOST_URL) {
  console.log(`locking ${amount} ether into Lockdrop contract for 6 months. Receiver: ${supernovaAddress}`);
  console.log(`Contract ${lockdropContractAddress}`);
  const web3 = getWeb3(remoteUrl, key);
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  // Grab account's transaction nonce for tx params
  let txNonce = await web3.eth.getTransactionCount(web3.currentProvider.addresses[0]);
  // Convert ETH amount submitted into WEI
  const value = web3.utils.toWei(amount, 'ether');
  // Create tx params for lock function
  const tx = new EthereumTx({
    nonce: txNonce,
    from: web3.currentProvider.addresses[0],
    to: lockdropContractAddress,
    gas: 150000,
    data: contract.methods.lock(length, supernovaAddress).encodeABI(),
    value: toBN(value),
  });
  // Sign the tx and send it
  try {
    tx.sign(Buffer.from(key, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txReceipt = await web3.eth.sendSignedTransaction(raw);
    console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  } catch (e) {
    console.log(e);
  }
}

export const unlock = async (key, lockContractAddress, remoteUrl=LOCALHOST_URL, nonce=undefined) => {
  console.log(`Unlocking lock contract: ${lockContractAddress}`);
  const web3 = getWeb3(remoteUrl);
  try {
    // Grab account's transaction nonce for tx params if nonce is not provided
    if (!nonce) {
      nonce = await web3.eth.getTransactionCount(web3.currentProvider.addresses[0]);
    }
    // Create generic send transaction to unlock from the lock contract
    const tx = new EthereumTx({
      nonce: nonce,
      from: web3.currentProvider.addresses[0],
      to: lockContractAddress,
      gas: 100000,
    });
    // Sign the tx and send it
    tx.sign(Buffer.from(key, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txReceipt = await web3.eth.sendSignedTransaction(raw);
    console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  } catch(e) {
    console.log(e);
  }
}

export const generateEncryptedWallet = (passphrase) => {
  return jswallet.generate().toV3(passphrase);
}

export const getPrivateKeyFromEnvVar = (key) => {
  return (key.indexOf('0x') === -1) ? key : key.slice(2);
};

export const getPrivateKeyFromEncryptedJson = (keystorePath, jsonVersion, password) => {
  if (fs.existsSync(keystorePath)) {
    const json = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
    let wallet;
    if (jsonVersion.toLowerCase() === 'ethsale') {
      wallet = jswallet.fromEthSale(json, password);
    } else if (jsonVersion.toLowerCase() === 'v1') {
      wallet = jswallet.fromV1(json, password);
    } else if (jsonVersion.toLowerCase() === 'v3') {
      wallet = jswallet.fromV3(json, password);
    } else {
      throw new Error('Please add a valid encrypted JSON keystore file version under key ETH_JSON_VERSION to a .env file in the project directory');
    }

    // Warning: Only use console.log in the example
    // console.log("Private key " + wallet.getPrivateKey().toString("hex"));
    return wallet.getPrivateKey().toString("hex");
  } else {
    throw new Error('Please add a valid encrypted JSON keystore file under key ETH_KEY_PATH to a .env file in the project directory');
  }
}