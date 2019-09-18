const Promise = require('bluebird');
const { toBN, fromWei, hexToNumber } = require('web3').utils;

const getLocks = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

const getTotalLockedBalance = async (lockdropContract) => {
  let { totalETHLocked, totalEffectiveETHLocked } = await calculateEffectiveLocks(lockdropContract);
  return { totalETHLocked, totalEffectiveETHLocked };
};

const calculateEffectiveLocks = async (lockdropContracts) => {
  let totalETHLocked = toBN(0);
  let totalEffectiveETHLocked = toBN(0);
  const locks = {};
  const validatingLocks = {};

  let lockEvents = []
  for (index in lockdropContracts) {
    let events = await lockdropContracts[index].getPastEvents('Locked', {
      fromBlock: 0,
      toBlock: 'latest',
    });

    lockEvents = [ ...lockEvents, ...events ];
  }

  // For truffle tests
  let lockdropStartTime;
  if (typeof lockdropContracts[0].LOCK_START_TIME === 'function') {
    lockdropStartTime = (await lockdropContracts[0].LOCK_START_TIME());
  } else {
    lockdropStartTime = (await lockdropContracts[0].methods.LOCK_START_TIME().call());
  }

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    totalETHLocked = totalETHLocked.add(toBN(data.eth));

    // Add all locks to collection, calculating/updating effective value of lock
    if (data.edgewareAddr in locks) {
      locks[data.edgewareAddr] = {
        lockAmt: toBN(data.eth).add(toBN(locks[data.edgewareAddr].lockAmt)).toString(),
        lockAddrs: [data.lockAddr, ...locks[data.edgewareAddr].lockAddrs],
      };
    } else {
      locks[data.edgewareAddr] = {
        lockAmt: toBN(data.eth).toString(), 
        lockAddrs: [data.lockAddr],
      };
    }
  });
  // Return validating locks, locks, and total ETH locked
  return { locks, totalETHLocked };
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

module.exports = {
  getLocks,
  getTotalLockedBalance,
  getLockStorage,
};