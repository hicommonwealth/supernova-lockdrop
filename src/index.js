import { connectToLedger, connectToBcoin } from './connect';

(async function() {
  let util = connectToBcoin();
  let result = await util.lockAndRedeemCLTV(1);
})();
