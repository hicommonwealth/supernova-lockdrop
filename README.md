# supernova-lockdrop

Multi-chain lockdrop contracts for Supernova.

## Overview

The Supernova chain is a new blockchain that will be built
using the Cosmos SDK and integrate into the Cosmos ecosystem. It has a
variety of awesome features and we're planning to make it one of the
most interactive cryptocurrency experiences to date. To find more
information on Supernova click [here](INSERT_LINK).

The Supernova Lockdrop is a distribution mechanism for rewarding
lockdrop participants with tokens on the Supernova chain at
launch.

The repo contains scripts for generating a Supernova address for your
future coins, executing time-lock transactions in Bitcoin and
Ethereum, and bonding to a Cosmos Hub validator configured to
manage ATOM participation in the Supernova Lockdrop.

Time-lock transactions are transactions where one locks up their
cryptocurrency of choice for a specified amount of time. In the case
of the Supernova Lockdrop, the time-lock length is 6 months or 182
days. This functionality will be provided by the CLI; it may also be
provided in various user interfaces.

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

### Generating a Supernova address (and for other protocols)
After running `npm` or `yarn` to install all the packages. You can now
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

- You must provide an Ethereum private key by setting ETH_PRIVATE_KEY,
  or provide an encrypted Ethereum keystore by setting ETH_KEY_PATH,
  ETH_JSON_VERSION, and ETH_JSON_PASSWORD.
- You must also set up an Ethereum node path. You can get one by
  registering on Infura at https://infura.io and using the free tier.
  You can also use a local node, or a non-Infura Ethereum node.
- You must generate a Supernova address.

Your .env should look like this:

```
INFURA_PATH=https://mainnet.infura.io/v3/abc...
ETH_PRIVATE_KEY=ABC...
SUPERNOVA_ADDRESS=0x01...
```
You can now send a lock transaction.

#### Locking examples
1. Lock 0.01 ETH on the network linked by `INFURA_PATH`
```
yarn start --eth --lock 0.01
```

#### Verification examples

In order to verify that your lock transaction has happened, visit Etherscan
and paste the transaction hash you got from the CLI output to visualize it.


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

Once linked globally, you should be able to start a mainnet node with
the following command. It will take some time to sync:

```
bcoin
```

Now, install `ipfs` globally to have access to the `jsipfs` command,
and launch the ipfs daemon:

```
npm install ipfs --global
jsipfs daemon
```

Once you have Bcoin and IPFS running, you can proceed with your lock!

Bcoin comes with a native wallet that you can use to fund new keys to
participate in the lockdrop. To learn more about the commands to run,
you can read the [API
documentation](https://bcoin.io/api-docs/?shell--cli#wallet).

(To be included, BTC/IPFS locking instructions.)
#### Locking examples
Ensure you have a live, local Bcoin node for the respective network and
an IPFS daemon or remote IPFS node before proceeding.
1. Lock 0.5 BTC on a Bitcoin regtest network with default wallet settings:
```
yarn lock-btc 0.5 (optionally, --network=regtest)
```
2. Lock 0.5 BTC on the main Bitcoin network with default wallet settings:
```
yarn lock-btc 0.5 --network=main
```
3. Lock 0.5 BTC on the main Bitcoin network with non-default wallet settings:
```
yarn lock-btc 1 --walletId=test --walletAccount=default --network=main
```

#### Verification examples
Once you successfully lock, you will have a file named `tx-info.json` generated
in your project directory. You can use the hash of the `lockedTx` to verify
that the transaction was broadcasted on any Bitcoin blockchain explorer. Similarly,
you can look up the data at the IPFS multihashes to visualize the data stored there. 


### Cosmos

- To use the Cosmos query functionality, you must provide a URL of the
  Cosmos node you want to query against or have one setup locally.

(To be continued...)

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

# Ledger configuration (not currently supported)
LEDGER_KEY_PURPOSE=...
LEDGER_COIN_TYPE=...
LEDGER_DERIVATION_PATH=...
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

### Advanced usage and development

Optionally, you can set the Bitcoin node to enable pruning, provide an
http server to connect to with an api key, or use other commands (for
testnets, and indexing txs, etc.). Many of the options are described
in the guide linked above.

If you are running the tests in this package, the options we use are:

```
bcoin --network=regtest --http-host=0.0.0.0 --api-key=test --index-tx --index-address
```

If you choose to use a pruned node, be aware that there are
technicalities with it interfacing with already funded wallets. We
recommend a pruned node for fresh wallets that have not been funded
prior to syncing the chain.

### Functionality

- [] Supernova address generation
- [x] ETH locking functionality with private key
- [x] ETH locking functionality with encrypted private keystore, stored locally
- [x] ETH locking instructions
- [x] ETH lock verification instructions
- [x] BTC locking functionality with mnemonic that is funded
- [x] BTC locking functionality with native Bcoin wallet that is funded
- [x] BTC locking instructions
- [x] BTC lock verification instructions
- [] BTC locking functionality using a Ledger hardware device
- [x] Cosmos bonded delegators and validators querying
- [x] ATOM (un)locking functionality
- [] ATOM locking/bonding instructions
- [] ATOM lock/bond verification instructions (later)
