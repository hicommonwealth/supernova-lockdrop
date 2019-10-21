require('dotenv').config();
import * as eth from '../src/ethLock';
import assert from 'assert';

describe('ethereum locks', () => {
  const testPrivKey = '0x2323777562ad2e0bc362210cb276c20ed1493851b5507ad5f31426a07c5cbd70';
  const lockdropContractAddress = process.env.LOCKDROP_CONTRACT_ADDRESS || '0x3000AFeCF178734e0253eBe794CfDd5f908e3933';

  it('should generate a new keystore and setup web3 provider', async () => {
    const passphrase = 'test';
    const jsonWallet = eth.generateEncryptedWallet(passphrase);
    const wallet = eth.getPrivateKeyFromEncryptedJson(undefined, 'v3', passphrase, jsonWallet);
    let web3 = eth.getWeb3(eth.LOCALHOST_URL, wallet);
    assert(web3);

    let result = await eth.lock(testPrivKey, '1', lockdropContractAddress, '0x02', eth.LOCALHOST_URL);
    assert(result);
  });
});