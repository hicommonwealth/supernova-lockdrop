# supernova-lockdrop
Multi-chain lockdrop contracts for Supernova.

## Overview
This repo contains scripts for executing time-lock transactions in Bitcoin and Ethereum as well as querying the Cosmos chain for active, bonded participants. Time-lock transactions are transactions where one locks up their cryptocurrency of choice for a specified amount of time. In the case of the Supernova Lockdrop, the time-lock length is 6 months or 182 days.

The Supernova Lockdrop is a distribution mechanism for rewarding lockdrop participants with tokens on the Supernova chain at launch. The Supernova chain is a new blockchain that will be built using the Cosmos SDK and integrate into the Cosmos ecosystem. It has a variety of awesome features and we're planning to make it one of the most interactive cryptocurrency experiences to date. To find more information on Supernova click [here](INSERT_LINK).

#### Some notes on locking
Locking in Bitcoin and Ethereum is arguable very different. In Bitcoin, one must create a checktimelockverify (CTLV) transaction with a future locktime and a redeem address to eventually unlock funds. In Ethereum, one can write any manner of smart contracts to handle time-locking. These contracts can fire events, force certain locktimes, and allow quick retrieval of the metadata to verify the existence of a lock.

The most crucial difference is that Bitcoin time-lock transactions are a pay-to-scripthash transaction where the script is a CTLV transaction. Therefore, since we pay to a hash value, it is impossible to ascertain what the underlying script is before redeeming. Furthermore, since we cannot ascertain what the underlying script is, we cannot verify that it is indeed a timelock up until the point of unlocking funds. In order for one to properly participate in the Supernova Lockdrop, we are appending an OP_RETURN transaction output to these Bitcoin transactions, which contains a link to the transaction metadata for verification. In this CLI, we store an IPFS hash in the OP_RETURN data field and store the respective transaction data at that IPFS hash.

We must stress this importantly, Bitcoin locks can ONLY be honored if they follow this protocol, of storing the metadata in IPFS or some other method that will allow us to validate it for the Supernova distribution. This could be done outside the CLI by sharing transaction data with us through third-party services or other methods, though we recommend following the protocol in the CLI. In addition, these locks will ONLY be honored if they adhere to the strict locktime of 6 months from the time of the transaction.

## Usage
This repo contains a CLI for interacting with 3 blockchains: Bitcoin, Ethereum, and Cosmos, for the purposes of locking or querying statistics in the Supernova Lockdrop. At the highest level, you must generate a Supernova address to receive your future Supernova coins to. This functionality will also be provided by the CLI.
#### Ethereum
- To use the Ethereum lock functionality, you must provide an Ethereum private key or path to an encrypted Ethereum keystore. 
#### Bitcoin
- To use the Bitcoin lock functionality, you must provide a Bitcoin mnemonic or set up a local wallet using Bcoin.
- You will also need a local, mainnet Bcoin instance running locally.
- You will also need a local or remote IPFS node to store your transaction data for further verification.
#### Cosmos
- To use the Cosmos query functionality, you must provide a URL of the Cosmos node you want to query against or have one setup locally.

### Environment variables
The CLI uses environment variables to configure the desired functionality. You should create a `.env` file in the project directory and populate the following inputs, depending on your desired participation methods.
```
# Supernova Address
SUPERNOVA_ADDRESS=0x01

# Bitcoin configuration environment variables
# BTC mnemonic seed
BTC_BIP39_MNEMONIC_SEED="donate smooth boy ostrich fiction alcohol range struggle extra input fancy chapter organ cake transfer start balance sorry whip stem carpet finish novel among"

# IPFS configuration environment variables
# IPFS multiaddress to connect for storing data on timelocks
IPFS_REMOTE_URL=



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

### Functionality
- [x] ETH locking functionality with private key
- [x] ETH locking functionality with encrypted private keystore, stored locally
- [x] BTC locking functionality with mnemonic that is funded
- [x] BTC locking functionality with native Bcoin wallet that is funded
- [] BTC locking functionality using a Ledger hardware device
- [x] Cosmos bonded delegators and validators querying