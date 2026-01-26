import { Network } from "cashscript";

// Since each use may result in a different
// transaction size, instead of trying to estimate the fee,
// we will just use a hardcoded fee with a slight margin.
export const UNLOCKING_TX_FEE_AMOUNT = BigInt(420);

export const DEFAULT_BCH_NETWORK = "mainnet" as Network;

export const BCH_NETWORK_ENV_VAR_NAME = "BCH_NETWORK";

// Minimum bounty amounts per network (in satoshis)
// Mainnet: 0.001 BCH to ensure commission is meaningful
// Testnet: 0.0001 BCH for easier testing
export const MIN_BOUNTY_SATS: Record<string, bigint> = {
  mainnet: BigInt(100000), // 0.001 BCH
  testnet3: BigInt(10000), // 0.0001 BCH
  testnet4: BigInt(10000), // 0.0001 BCH
  chipnet: BigInt(10000), // 0.0001 BCH
  regtest: BigInt(10000), // 0.0001 BCH
};

// Minimum bounty amounts per network (in BCH)
export const MIN_BOUNTY_BCH: Record<string, number> = {
  mainnet: 0.001,
  testnet3: 0.0001,
  testnet4: 0.0001,
  chipnet: 0.0001,
  regtest: 0.0001,
};

// Maximum bounty amount (in BCH) - protocol maximum
export const MAX_BOUNTY_BCH = 21_000_000;
