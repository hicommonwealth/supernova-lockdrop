import Web3, { utils } from 'web3';
import HDWalletProvider from "truffle-hdwallet-provider";
import { Transaction as EthereumTx} from 'ethereumjs-tx';
import jswallet from 'ethereumjs-wallet';
import fs from 'fs';

const { toBN, hexToNumber } = utils;
export const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./eth/build/contracts/Lockdrop.json').toString());
export const LOCALHOST_URL = 'http://localhost:8545';

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
  if (key.indexOf('0x') !== -1) {
    key = key.slice(2);
  }
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
    data: contract.methods.lock(supernovaAddress).encodeABI(),
    value: toBN(value),
  });
  // Sign the tx and send it
  tx.sign(Buffer.from(key, 'hex'));
  var raw = '0x' + tx.serialize().toString('hex');
  const txReceipt = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  return txReceipt;
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

export const getLocksForAddress = async (userAddress, lockdropContractAddress, remoteUrl=LOCALHOST_URL) => {
  const web3 = getWeb3(remoteUrl);
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  const lockEvents = await getLocks(contract, userAddress);
  const now = await getCurrentTimestamp(remoteUrl);

  let promises = lockEvents.map(async event => {
    let lockStorage = await getLockStorage(web3, event.returnValues.lockAddr);
    return {
      owner: event.returnValues.owner,
      eth: web3.utils.fromWei(event.returnValues.eth, 'ether'),
      lockContractAddr: event.returnValues.lockAddr,
      supernovaAddress: event.returnValues.supernovaAddr,
      unlockTime: `${(lockStorage.unlockTime - now) / 60} minutes`,
    };
  });

  return await Promise.all(promises);
}

export const getCurrentTimestamp = async (remoteUrl=LOCALHOST_URL) => {
  const web3 = getWeb3(remoteUrl);
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
}

export const getEthereumKeyFromEnvVar = (ETH_PRIVATE_KEY, ETH_KEY_PATH, ETH_JSON_VERSION, ETH_JSON_PASSWORD) => {
  return (ETH_PRIVATE_KEY)
    ? getPrivateKeyFromEnvVar(ETH_PRIVATE_KEY)
    : getPrivateKeyFromEncryptedJson(ETH_KEY_PATH, ETH_JSON_VERSION, ETH_JSON_PASSWORD);
}

export const generateEncryptedWallet = (passphrase) => {
  return jswallet.generate().toV3(passphrase);
}

export const getPrivateKeyFromEnvVar = (key) => {
  return (key.indexOf('0x') === -1) ? key : key.slice(2);
};

export const getPrivateKeyFromEncryptedJson = (keystorePath, jsonVersion, passphrase, jsonWallet) => {
  if (jsonWallet) {
    return parseWalletData(jsonVersion, passphrase, jsonWallet);
  } else {
    if (fs.existsSync(keystorePath)) {
      const json = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
      return parseWalletData(jsonVersion, passphrase, json);
    } else {
      throw new Error('Please add a valid encrypted JSON keystore file under key ETH_KEY_PATH to a .env file in the project directory');
    }
  }
}

const parseWalletData = (jsonVersion, passphrase, jsonWallet) => {
  let wallet;
  if (jsonVersion.toLowerCase() === 'ethsale') {
    wallet = jswallet.fromEthSale(jsonWallet, passphrase);
  } else if (jsonVersion.toLowerCase() === 'v1') {
    wallet = jswallet.fromV1(jsonWallet, passphrase);
  } else if (jsonVersion.toLowerCase() === 'v3') {
    wallet = jswallet.fromV3(jsonWallet, passphrase);
  } else {
    throw new Error('Please add a valid encrypted JSON keystore file version under key ETH_JSON_VERSION to a .env file in the project directory');
  }

  // Warning: Only use console.log in the example
  // console.log("Private key " + wallet.getPrivateKey().toString("hex"));
  return wallet.getPrivateKey().toString("hex");
};

const getLocks = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

const getLockStorage = async (web3, lockAddress) => {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
  .then(vals => {
    return {
      owner: vals[0],
      unlockTime: hexToNumber(vals[1]),
    };
  });
};
