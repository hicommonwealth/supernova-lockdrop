const Lockdrop = artifacts.require("Lockdrop.sol");
const utility = require('../helpers/util');
// June 1st
// TODO: Change/decide on the launch time
const MAINNET_LAUNCH_UNIX_TIME = 1559347200;

module.exports = async function(deployer, network, accounts) {
  if (network === 'ropsten' || network === 'development') {
    let time = await utility.getCurrentTimestamp(web3);
    await deployer.deploy(Lockdrop, time);
  } else {
    await deployer.deploy(Lockdrop, MAINNET_LAUNCH_UNIX_TIME);
  }
};