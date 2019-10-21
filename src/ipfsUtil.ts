import ipfsClient from 'ipfs-http-client';

export const sendData = (multiAddr = '/ip4/127.0.0.1/tcp/5002', data = 'testing'): Promise<string> => {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  console.log(data);
  const ipfs = ipfsClient(multiAddr);
  return new Promise((resolve, reject) => {
    ipfs.add(Buffer.from(data), function(err, results) {
      console.log('here');
      if (err) return reject(err);
      return resolve(results[0].path);
    });
  });
}

export const addToIPFS = async (multiAddr, obj): Promise<Buffer> => {
  try {
    let ipfsHash = await sendData(multiAddr, obj);
    const buf = Buffer.from(ipfsHash);
    return buf;
  } catch (e) {
    console.log('You must connect to a local or remote IPFS node to store data');
    throw new Error(e);
  }
}
