require('dotenv').config();
import * as eth from '../src/ethLock';
import assert from 'assert';

describe('ethereum locks', () => {
  const testUserAddress = '0xc848c2d3d84c32389dc7af4bfc71bab6ea71fc1c';
  const testPrivKey = '0x298c412983880d711b799b098e2efe4751b976727af866ffbe45bffc1cf89c2c';
  const lockdropContractAddress = '0xD2ab3A16B1910D745693833873E5ba8FB574ee07';

  it('should generate a new keystore and lock once', async () => {
    const passphrase = 'test';
    const jsonWallet = eth.generateEncryptedWallet(passphrase);
    const wallet = eth.getPrivateKeyFromEncryptedJson(undefined, 'v3', passphrase, jsonWallet);
    let web3 = eth.getWeb3(eth.LOCALHOST_URL, wallet);
    assert(web3);

    let result = await eth.lock(testPrivKey, '1', lockdropContractAddress, '0x02', eth.LOCALHOST_URL);
    assert(result);
  });

  it('should collect locks for a participant', async () => {
    const supernovaAddress = '0x01';
    await eth.lock(testPrivKey, '1', lockdropContractAddress, supernovaAddress, eth.LOCALHOST_URL);
    const locks = await eth.getLocksForAddress(testUserAddress, lockdropContractAddress);
    assert(locks.length > 0);
    assert(locks[0].owner);
    assert(locks[0].eth);
    assert(locks[0].lockContractAddr);
    assert(locks[0].supernovaAddress);
    assert(locks[0].unlockTime);
  });
});