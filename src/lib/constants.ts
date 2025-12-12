import { Network } from "cashscript";

// Since each use may result in a different
// transaction size, instead of trying to estimate the fee,
// we will just use a hardcoded fee with a slight margin.
export const UNLOCKING_TX_FEE_AMOUNT = BigInt(420);

export const DEFAULT_BCH_NETWORK = "mainnet" as Network;

export const BCH_NETWORK_ENV_VAR_NAME = "BCH_NETWORK";
