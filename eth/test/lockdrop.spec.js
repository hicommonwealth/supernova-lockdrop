const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/index');

const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");

contract('Lockdrop-1', (accounts) => {
  const SECONDS_IN_DAY = 86400;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp(web3);
    lockdrop = await Lockdrop.new(time);
  });

  it('should setup and pull constants', async function () {
    let time = await utility.getCurrentTimestamp(web3);
    let LOCK_DROP_PERIOD = (await lockdrop.LOCK_DROP_PERIOD()).toNumber();
    let LOCK_START_TIME = (await lockdrop.LOCK_START_TIME()).toNumber();
    assert.equal(LOCK_DROP_PERIOD, SECONDS_IN_DAY * 182);
    assert.ok(LOCK_START_TIME <= time && time <= LOCK_START_TIME + 1000);
  });

  it('should lock funds and also be a potential validator', async function () {
    await lockdrop.lock(accounts[1], {
      from: accounts[1],
      value: 1,
    });

    const lockEvents = await ldHelpers.getLocks(lockdrop, accounts[1]);
    assert.equal(lockEvents.length, 1);
    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(web3, event.returnValues.lockAddr);
    }));

    assert.equal(lockStorages[0].owner, lockEvents[0].returnValues.owner.toLowerCase());
  });

  it('should unlock the funds after the lock period has ended', async function () {
    const balBefore = await utility.getBalance(accounts[1], web3);
    let txHash = await lockdrop.lock(accounts[1], {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    const balAfter = await utility.getBalance(accounts[1], web3);

    const lockEvents = await ldHelpers.getLocks(lockdrop, accounts[1]);
    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(web3, event.returnValues.lockAddr);
    }));
    let unlockTime = lockStorages[0].unlockTime;

    const lockContract = await Lock.at(lockEvents[0].returnValues.lockAddr);

    let time = await utility.getCurrentTimestamp(web3);
    let res = await utility.advanceTime(unlockTime - time + SECONDS_IN_DAY, web3);

    txHash = await lockContract.sendTransaction({
      from: accounts[1],
      value: 0,
      gas: 50000,
    });

    const afterafter = await utility.getBalance(accounts[1], web3);
    assert.ok(balBefore > balAfter);
    assert.ok(afterafter > balAfter);
  });

  it('should not allow one to lock before the lock start time', async function () {
    let time = await utility.getCurrentTimestamp(web3);
    const newLockdrop = await Lockdrop.new(time + SECONDS_IN_DAY * 10);
    utility.assertRevert(newLockdrop.lock(accounts[1], {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    }));
  });

  it('should not allow one to lock after the lock end time', async function () {
    await lockdrop.lock(accounts[1], {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    utility.advanceTime(SECONDS_IN_DAY * 365, web3);
    utility.assertRevert(lockdrop.lock(accounts[1], {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    }));
  });
});