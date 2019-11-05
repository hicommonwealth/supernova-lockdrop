# supernova-lockdrop

Multi-chain lockdrop contracts for Supernova.

## Overview

The Supernova chain is a new blockchain that will be built
using the Cosmos SDK and integrate into the Cosmos ecosystem. It has a
variety of awesome features and we're planning to make it one of the
most interactive cryptocurrency experiences to date. To find more
information on Supernova click [here](INSERT_LINK).

The Supernova Lockdrop is a distribution mechanism which will reward
participants who lock up their coins on different chains. In the case
of the Supernova Lockdrop, the time-lock length is 6 months or 182
days, and the Bitcoin, Ethereum, and Cosmos Hub blockchains will be
supported.

The repo contains scripts for generating a Supernova address for your
future coins, executing time-lock transactions in Bitcoin and
Ethereum, and bonding to a Cosmos Hub validator configured to
manage ATOM participation in the Supernova Lockdrop.

## Setup

These lockdrop scripts expect Node v11.6. If you don't have it
installed, we recommend using NVM:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
nvm install 11.6.0
nvm use 11.6.0
yarn
```

You will then have to set up environment variables in `.env` to
include any private keys, node URLs, or other data required for
locking. Detailed instructions for each step are below.

### Generating addresses

First, run `npm` or `yarn` to install all the packages. You can now
generate a Supernova keypair or keypair for another protocol. Note, if
you want to generate a new bitcoin wallet (in bcoin) you will need a
live bcoin node running locally.

1. To generate a Supernova keypair:

```
yarn generate --supernova
```

2. To generate an Ethereum keypair:

```
yarn generate --eth
```

3. To generate a Bitcoin wallet and/or account in bcoin (must have running bcoin node):

```
yarn generate --btc --walletId=<...> --walletAccount=<...>
```

4. To generate a Cosmos keypair:

```
yarn generate --cosmos
```


### Ethereum

You must provide an Ethereum private key by setting ETH_PRIVATE_KEY,
or provide an encrypted Ethereum keystore by setting ETH_KEY_PATH,
ETH_JSON_VERSION, and ETH_JSON_PASSWORD.

You can generate an Ethereum private key by using a wallet like
Metamask or Trust Wallet to create a new Ethereum address, and then
exporting the private key.

You must also set up an Ethereum node path. You can get one by
registering on Infura at https://infura.io and using the free tier.

Finally, you should generate a Supernova address. Your .env should
look like this:

```
INFURA_PATH=https://mainnet.infura.io/v3/abc...
ETH_PRIVATE_KEY=ABC...
SUPERNOVA_ADDRESS=0x01...
```

You can now send a lock transaction. To lock 0.01 ETH on the network
indicated by `INFURA_PATH`, run:

```
yarn start --eth --lock 0.01
```

In order to verify that your lock transaction has happened, visit
Etherscan and paste the transaction hash you got from the CLI output
to visualize it.


### Bitcoin

- To use the Bitcoin lock functionality, you must provide a Bitcoin
  mnemonic, or set up a local wallet using Bcoin.
- You will also need a local, mainnet Bcoin instance running locally.
- You will also need a local or remote IPFS node to store your
  transaction data for further verification.

To install bcoin, follow the guide
[here](https://bcoin.io/guides/beginners.html). The steps should
approximately be:

```
git clone https://github.com/bcoin-org/bcoin.git
cd bcoin
npm install
npm install -g # link globally
```

Once installed, you should be able to start a mainnet node. As long as
you are not using a preexisting wallet from an earlier install of
bcoin, you should include the pruning flag, which will greatly speed
up syncing:

```
bcoin --prune
```

Now, install `ipfs` globally to have access to the `jsipfs` command,
and launch the ipfs daemon:

```
npm install ipfs --global
jsipfs daemon
```

Once you have Bcoin and IPFS running, you can proceed with your lock!


#### Locking examples

Bcoin comes with a native wallet that you can use to fund new keys to
participate in the lockdrop. To learn more about the commands to run,
you can read the [API documentation](https://bcoin.io/api-docs/?shell--cli#wallet).
For our examples, we will create a new wallet by running a wallet
node.

If you are using a local node, run:

```
bwallet
```

If you are using a remote node, instead run:

```
bwallet --node-host=bcoin.commonwealth.im --node-api-key=supernova
```

This will start the *wallet node* locally. You can now use
`bwallet-cli` to talk to it and generate keys or sign transactions.

To create a wallet called `default`:

```
bwallet-cli account create default
```

To lock one satoshi on a Bitcoin regtest network with default wallet settings:

```
yarn lock-btc 0.00000001
```

To lock 0.5 BTC on the main Bitcoin network with default wallet settings:

```
yarn lock-btc 0.5 --network=main
```

To lock 1 BTC on the main Bitcoin network with non-default wallet settings:

```
yarn lock-btc 1 --walletId=test --walletAccount=default --network=main
```

Once you successfully lock, you will have a file named `tx-info.json`
generated in your project directory. You can use the hash of the
`lockedTx` to verify that the transaction was broadcasted on any
Bitcoin blockchain explorer. Similarly, you can look up the data at
the IPFS multihashes to visualize the data stored there.

### Cosmos

- To use Cosmos functionality without `gaiacli` installed, you must provide the
  address of both an active Tendermint RPC and an active REST server. With
  `gaiacli` installed, we only require the Tendermint RPC server.
- You must also provide a validator address to delegate to (for specifics
  on cosmos delegation functionality, see
  [notes on Cosmos locking](#notes-on-cosmos-locking).

Cosmos functionality requires communication with an active node. The node
itself exposes a Tendermint RPC listener on port 26657 by default for lower-
level queries. Gaia also provides a separate, distinct listener, run
with the `gaiacli rest-server` command, and listening on port 1317 by default.
This server provides higher-level query functionality. This REST server
must be configured to communicate with an active Tendermint node. See below for
the exact environment variables required to configure your connection to a node.

Locking and unlocking on Cosmos optionally requires the `gaiacli` tool.
Documentation for its installation can be found on the
[Cosmos site](https://cosmos.network/docs/cosmos-hub/installation.html#install-gaia).
Note that you will want to install `go` 1.13 or later, even though the
instructions say otherwise, if you want to interact with the most recent
version of the Cosmos chains.

Once installed, ensure your .env file is configured with the following fields
(we provide a Cosmos node on the gaia-13006 testnet at `149.28.47.49`, although
we cannot make any guarantees about uptime). Note that COSMOS_KEY_PATH is optional
if using a saved `gaiacli` key, which must be then provided via `--keyName`.

```
TENDERMINT_URL=http://149.28.47.49:26657...
COSMOS_REST_URL=http://149.28.47.49:1317...
COSMOS_KEY_PATH=lockfile.json...
GAIACLI_PATH=/home/yourusername/go/bin/gaiacli...
```

If correctly configured, the delegation or undelegation should occur
immediately. See [notes on Cosmos locking](#notes-on-cosmos-locking)
for information on how to verify the status of your delegation.

#### Locking examples

Ensure you have a live Cosmos node url configured before proceeding, as
well as an active validator address to delegate to, e.g.
`cosmosvaloper1le0gdn7u8z4vyjyctp32zhmqd2wufvy5tkrd6x`.

1. Lock 100 UATOM on a Cosmos network, using a `gaiacli` install which has been
  registered with a key named "TestKey". You will be prompted to enter your
  previously configured password for TestKey, after which the lock will occur
  immediately.
```
yarn lock-atom 100 --keyName TestKey --validator cosmosvaloper1le0gdn7u8z4vyjyctp32zhmqd2wufvy5tkrd6x
```

### Supernova

- There are no requirements besides installing and running the CLI
  key generation command to generate keychains. We recommend passing
  in an output filename to store the keystore to.

## Environment variables

The CLI uses environment variables to configure the desired
functionality. You should create a `.env` file in the project
directory and populate the following inputs, depending on your desired
participation methods.

```
# Supernova Address
SUPERNOVA_ADDRESS=...

# Bitcoin configuration environment variables
# BTC mnemonic seed
BTC_BIP39_MNEMONIC_SEED="..."
# Bitcoin network
BTC_NETWORK_SETTING=regtest
# Bcoin settings
BCOIN_WALLET_ID=
BCOIN_WALLET_ACCOUNT=
BCOIN_WALLET_PASSPHRASE=
BCOIN_NODE_ADDRESS=
BCOIN_WALLET_NODE_ADDRESS=

# IPFS configuration environment variables
# Multiaddress to connect for storing data on timelocks
IPFS_MULTIADDR=...

# Ethereum configuration environment variables
# Lockdrop contract on Ethereum
LOCKDROP_CONTRACT_ADDRESS=...
# ETH private key hex
ETH_PRIVATE_KEY=...
# ETH private key file location (a path on your machine)
ETH_KEY_PATH=...
# ETH version of encrypted JSON file (either v1, v2, or ethsale)
ETH_JSON_VERSION=...
# ETH encrypted JSON file password (alternative to providing provide key)
ETH_JSON_PASSWORD=...

# Infura path for sending ETH transactions to remote Infura node
INFURA_PATH=...

# Cosmos configuration environment variables
# Active node URL
TENDERMINT_URL=...
# Active rest URL
COSMOS_REST_URL=...
# ID of current chain active on node
COSMOS_CHAIN_ID=...
# local gaiacli install location
GAIACLI_PATH=/home/yourusername/go/bin/gaiacli...
# path to keyfile
COSMOS_KEY_PATH=lockfile.json...
```

### Some notes on locking

Locking in Bitcoin and Ethereum are very different. In Bitcoin, one
must create a checktimelockverify (CTLV) transaction with a future
locktime and a redeem address to eventually unlock funds. In Ethereum,
one can write any manner of smart contracts to handle
time-locking. These contracts can fire events, force certain
locktimes, and allow quick retrieval of the metadata to verify the
existence of a lock.

The most crucial difference is that Bitcoin time-lock transactions are
a pay-to-scripthash transaction where the script is a CTLV
transaction. Since the transaction pays to a hash value, it is
impossible to ascertain what the underlying script is before
redeeming, and thus it is impossible to verify that a transaction is
indeed a timelock until the funds are unlocked.

To get around this, and to make it possible for a third-party to
identify the total set of time-lock transactions, Supernova Lockdrop
participants must append an OP_RETURN at the end of their Bitcoin
transaction which contains a link to their unhashed transaction
metadata on IPFS.

In this CLI, we do this by storing an IPFS hash in the OP_RETURN data
field, and we store the respective transaction data at that IPFS hash.
Bitcoin locks can ONLY be honored if they follow this protocol. In
addition, locks will ONLY be honored if they adhere to the strict
locktime of 6 months from the time of the transaction.

#### Notes on Cosmos locking

Similarly, locking on Cosmos is different in that it does not involve a
contract. All that is required is delegating some amount of tokens to an
active validator on the cosmoshub mainnet, which will be automatically
counted as a lock if still delegated at a chosen "lock height", the
block when delegation amounts are counted. You can query the list of
validators via the `gaiacli` tool, with `gaiacli query staking validators`.
You may also need to provide a chain node to query via the `--node` flag
and a chain ID using the `--chain-id` flag. You can also find validator
information on a block explorer, a list of which can be found in the
[Cosmos documentation](https://hub.cosmos.network/#cosmos-hub-explorers).

As a result, unlocking can be a partial or a complete operation, in which
you can either withdraw all delegated tokens, or some portion of them. We
do not store the amount delegated via the command line, so to fully unlock
will require looking up your total delegation. As with querying active
validators, this can be done either with a block explorer or via
the `gaiacli` tool (you can do this with `gaiacli query staking delegation`,
providing a validator and a delegator addresses). Querying validators can be
performed directly using this script, assuming correct .env configuration,
by running `yarn start --cosmos --query [--validator <validatorAddress>]`.
The `--useGaia` is also valid for this command, and will simply forward
the query to your installation of `gaiacli`.

A final note is that delegating on Cosmos also results in your account
accumulating rewards, based on the configuration of the specific validator
you've delegated to. These can also be withdrawn via the command line, using
`gaiacli tx distribution withdraw-rewards`, specifying the validator address
as well as your personal address via the `--from` flag. Note that you may need
to provide `gaiacli` with your address's associated mnemonic, or else have your
address configured with `gaiacli keys` before proceeding with this command.

### Other notes

Optionally, you can set the Bitcoin node to provide an http server,
only accept connections with an api key, or set other parameters to
run testnets, index txs, etc.

If you choose to use a pruned node, be aware that there are
technicalities with it interfacing with already funded wallets. We
recommend a pruned node for fresh wallets that have not been funded
prior to syncing the chain.

### Testing

If you are running the tests in this package, the options we use are:

```
bcoin --network=regtest --http-host=0.0.0.0 --api-key=test --index-tx --index-address
```
