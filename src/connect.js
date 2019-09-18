import bledger from 'bledger';
import bcoin from 'bcoin';
import btcTimeLock from './btcTimeLock.js';

export const connectToLedger = async () => {
  const { Device } = bledger.USB;
  const { LedgerBcoin } = bledger;
  console.log(LedgerBcoin)
  // Get all available devices via bledger
  const devices = await Device.getDevices();
  // Get the first device found
  let device = new Device({
    device: devices[0],
    timeout: 60000 // 60 seconds
  });
  // Connect to the device's interface
  await device.open();
  // Connect to the ledger device via bledger
  const bcoinApp = await new LedgerBcoin({ device });
  return btcTimeLock(bcoinApp);
};

export const connectToBcoin = () => {
  return btcTimeLock(bcoin);
};
