import ipfsClient from 'ipfs-http-client';

export const setupIPFSClient = async (data = 'testing', multiAddr = '/ip4/127.0.0.1/tcp/5002') => {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  const ipfs = ipfsClient(multiAddr);
  const results = await ipfs.add(Buffer.from(data));
  console.log(results);
  return results;
}
