import { BCHNetwork } from "@prisma/client";

/**
 * Get the network for website display filtering.
 * Defaults to mainnet if not set.
 */
export function getWebsiteNetwork(): BCHNetwork {
  const network = process.env.NEXT_PUBLIC_BCH_NETWORK;
  if (network === "testnet3") return BCHNetwork.TESTNET3;
  return BCHNetwork.MAINNET; // default
}

/**
 * Get the network name for display purposes.
 * Returns lowercase string suitable for UI display.
 */
export function getWebsiteNetworkName(): string {
  const network = process.env.NEXT_PUBLIC_BCH_NETWORK;
  if (network === "testnet3") return "testnet3";
  return "mainnet"; // default
}
