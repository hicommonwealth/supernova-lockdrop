const Web3 = require('web3');
const { toBN, fromWei } = require('web3').utils;
const HDWalletProvider = require("truffle-hdwallet-provider");
const EthereumTx = require('ethereumjs-tx');

const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./eth/build/contracts/Lockdrop.json').toString());
const LOCKDROP_CONTRACT_ADDRESS = process.env.LOCKDROP_CONTRACT_ADDRESS;
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const INFURA_PATH = process.env.INFURA_PATH;
const LOCALHOST_URL = 'http://localhost:8545';

export function getWeb3(remoteUrl) {
  let provider;
  if (ETH_PRIVATE_KEY) {
    provider = new HDWalletProvider(ETH_PRIVATE_KEY, remoteUrl);
  } else {
    provider = new Web3.providers.HttpProvider(remoteUrl);
  }
  const web3 = new Web3(provider);
  return web3;
}

export async function lock(length, amount, comsosAddress, remoteUrl=LOCALHOST_URL) {
  console.log(`locking ${value} ether into Lockdrop contract for ${length} months. Receiver: ${comsosAddress}`);
  console.log(`Contract ${LOCKDROP_CONTRACT_ADDRESS}`);
  const web3 = getWeb3(remoteUrl);
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
    data: contract.methods.lock(lockLength, comsosAddress, isValidator).encodeABI(),
    value: toBN(value),
  });
  try {
    // Sign the tx and send it
    tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txReceipt = await web3.eth.sendSignedTransaction(raw);
    console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  } catch (e) {
    console.log(e);
  }
}
