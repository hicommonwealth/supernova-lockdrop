# supernova-lockdrop

Multi-chain lockdrop contracts for Supernova.

## Overview

This repo contains scripts for executing time-lock transactions in
Bitcoin and Ethereum as well as querying the Cosmos chain for active,
bonded participants. Time-lock transactions are transactions where one
locks up their cryptocurrency of choice for a specified amount of
time. In the case of the Supernova Lockdrop, the time-lock length is 6
months or 182 days.

The Supernova Lockdrop is a distribution mechanism for rewarding
lockdrop participants with tokens on the Supernova chain at
launch. The Supernova chain is a new blockchain that will be built
using the Cosmos SDK and integrate into the Cosmos ecosystem. It has a
variety of awesome features and we're planning to make it one of the
most interactive cryptocurrency experiences to date. To find more
information on Supernova click [here](INSERT_LINK).

This repo contains a CLI for interacting with 3 blockchains: Bitcoin,
Ethereum, and Cosmos, for the purposes of locking or querying
statistics in the Supernova Lockdrop. At the highest level, you must
generate a Supernova address to receive your future Supernova coins.
This functionality will be provided by the CLI; it may also be
provided in various user interfaces.

## Setup

These lockdrop scripts expect Node v11.6. If you don't have it
installed, we recommend using NVM:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
nvm install
nvm use
yarn
```

You will then have to set up environment variables in `.env` to
include any private keys, node URLs, or other data required for
locking. Detailed instructions for each step are below.

### Generating a Supernova address

(To be completed.)

### Ethereum

- You must provide an Ethereum private key by setting ETH_PRIVATE_KEY,
  or provide an encrypted Ethereum keystore by setting ETH_KEY_PATH.
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

You can now send a lock transaction. To lock 0.01 ETH, run:

```
yarn start --eth --lock 0.01
```

In order to verify that your lock transaction has happened, you can
now run:

```
# TODO
```

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

(To be included, BTC/IPFS lock verification instructions.)

### Cosmos

- To use the Cosmos query functionality, you must provide a URL of the
  Cosmos node you want to query against or have one setup locally.

(To be included, ATOM locking instructions.)

(To be included, ATOM lock verification instructions.)

## Environment variables

The CLI uses environment variables to configure the desired
functionality. You should create a `.env` file in the project
directory and populate the following inputs, depending on your desired
participation methods.

```
# Supernova Address
SUPERNOVA_ADDRESS=0x01

# Bitcoin configuration environment variables
# BTC mnemonic seed
BTC_BIP39_MNEMONIC_SEED="donate smooth boy ostrich fiction alcohol range struggle extra input fancy chapter organ cake transfer start balance sorry whip stem carpet finish novel among"

# IPFS configuration environment variables
# Multiaddress to connect for storing data on timelocks
IPFS_MULTIADDR=

# Ethereum configuration environment variables
# Lockdrop contract on Ethereum
LOCKDROP_CONTRACT_ADDRESS=
# ETH private key hex
ETH_PRIVATE_KEY=
# ETH private key file location (a path on your machine)
ETH_KEY_PATH=
# ETH version of encrypted JSON file (either v1, v2, or ethsale)
ETH_JSON_VERSION=
# ETH encrypted JSON file password (alternative to providing provide key)
ETH_JSON_PASSWORD=

# Infura path for sending ETH transactions to remote Infura node
INFURA_PATH=

# Ledger configuration
LEDGER_KEY_PURPOSE=
LEDGER_COIN_TYPE=
LEDGER_DERIVATION_PATH=
```

### Locking


yarn lock-btc

yarn lock-eth

yarn query-cosmos

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
- [] ETH locking instructions
- [] ETH lock verification instructions
- [x] BTC locking functionality with mnemonic that is funded
- [x] BTC locking functionality with native Bcoin wallet that is funded
- [] BTC locking instructions
- [] BTC lock verification instructions
- [] BTC locking functionality using a Ledger hardware device
- [x] Cosmos bonded delegators and validators querying
- [] ATOM locking functionality (delegation)
- [] ATOM locking instructions
- [] ATOM lock verification instructions
