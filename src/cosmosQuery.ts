require('isomorphic-fetch');
const sleep = require('util').promisify(setTimeout);

export class Getters {
  private readonly restUrl: string;
  private readonly quiet: boolean;
  private height: number;
  public get latestHeight(): number {
    return this.height;
  }
  constructor(restUrl: string, quiet: boolean = false) {
    this.restUrl = restUrl;
    this.quiet = quiet;
  }

  public async init() {
    const latest = await this.restQuery('/blocks/latest');
    this.height = +latest.block_meta.header.height;
    if (!this.quiet) console.log(`Fetched latest block at height ${this.height}`);
  }

  public async valiators(height?: number) {
    const args = { height: height || this.height };
    return await this.restQuery(`/staking/validators`, args);
  }

  public async delegators(validatorAddr: string, height?: number) {
    const args = { height: height || this.height };
    return await this.restQuery(`/staking/validators/${validatorAddr}/delegations`, args);
  }

  // Queries a gaiacli REST endpoint for data, supporting args and pagination.
  private async restQuery(path: string, args = {}, page = 1, limit = 30) {
    const params = Object.assign({ page, limit }, args);
    const url = `${this.restUrl}${path}?` + this.constructParams(params);
    if (!this.quiet) console.log('REST Query: ' + url);
    const response = await fetch(url);
    if (response.status !== 200) {
      throw new Error('request failed with status: ' + response.status);
    }

    let data = await response.json();
    // remove height wrappers
    if (data.height !== undefined && data.result !== undefined) {
      data = data.result;
    }
    if (Array.isArray(data) && data.length === limit) {
      const nextResults = await this.restQuery(path, args, page + 1);
      return data.concat(nextResults);
    }
    return data;
  }

  private constructParams(params) {
    const esc = encodeURIComponent;
    const query = Object.keys(params)
        .map((k) => esc(k) + '=' + esc(params[k]))
        .join('&');
    return query;
  }
}

export interface IValidator {
  address: string;
  sharePrice: number;
}

// Fetches all current validator addresses.
export async function getValidators(
  getters: Getters, lockHeight?: number, numValidators?: number,
): Promise<IValidator[]> {
  const validators = await getters.valiators(lockHeight);

  // first, fetch all validators, and use them to construct an object of all delegators
  const validatorsToUse = numValidators ? validators.slice(0, numValidators) : validators;
  return validatorsToUse.map(({ operator_address, tokens, delegator_shares }) => ({
    address: operator_address,
    // Each delegator's stake in a validator is computed in shares. Each share represents a 1/total_shares% stake
    // in a validator, whose total value (in uatoms) is stored as tokens. Thus, to compute the price in uatoms of
    // each share, we divide the total number of tokens by the total number of shares.
    sharePrice: +tokens / +delegator_shares,
  }));
}

// Fetches the current set of delegated users along with the total amount they have bonded.
export async function getDelegations(
  getters: Getters,
  validators: IValidator[],
  lockHeight?: number,
  quiet: boolean = false,
  sleepLength: number = 50,
): Promise<{ [address: string]: number }> {
  const delegations: { [address: string]: number } = { };
  for (const validator of validators) {
    if (!quiet) console.log('Fetching data for validator: ' + validator.address + '...');
    const delegators = await getters.delegators(validator.address, lockHeight);
    for (const { delegator_address, shares } of delegators) {
      if (!delegations[delegator_address]) {
        delegations[delegator_address] = 0;
      }
      // See comment above about sharePrice -- we store the delegator's total bonded amount in
      // uatoms across all validators.
      delegations[delegator_address] += Math.floor((+shares) * validator.sharePrice);
    }

    // wait before fetching the next validator's delegator list to avoid slamming the REST server
    await sleep(sleepLength);
  }
  return delegations;
}

export async function queryLocks(
  getters: Getters,
  lockHeight: number,
  quiet: boolean = false,
  numValidators?: number,
  sleepLength?: number,
) {
  if (!quiet) console.log(`Computing locks at height ${lockHeight}` + (numValidators ? ` using ${numValidators} validators.` : '.'));

  if (!quiet) console.log('\nFetching validators...');
  const validators = await getValidators(getters, lockHeight, numValidators);
  if (!quiet) console.log('Fetched ' + validators.length + ' validators!');

  if (!quiet) console.log('\nFetching delegations...\n');
  const delegations = await getDelegations(getters, validators, lockHeight, quiet, sleepLength);

  if (!quiet) console.log('\nDONE!');
  return delegations;
}
