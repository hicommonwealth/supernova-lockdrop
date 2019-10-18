import ipfsClient from 'ipfs-http-client';

export const sendData = async (multiAddr = '/ip4/127.0.0.1/tcp/5002', data = 'testing') => {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  const ipfs = ipfsClient(multiAddr);
  const results = await ipfs.add(Buffer.from(data));
  console.log(`IPFS.add: ${data}`);
  console.log(results);
  return results[0].path;
}

export const addToIPFS = async (multiAddr, obj): Promise<Buffer> => {
  try {
    const ipfsHash = await sendData(multiAddr, obj);
    const buf = Buffer.from(ipfsHash);
    return buf;
  } catch (e) {
    console.log('You must connect to a local or remote IPFS node to store data');
    throw new Error(e);
  }
}
