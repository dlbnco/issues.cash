import type { Attempt } from "@prisma/client";
import { Network } from "cashscript";

/**
 * Format satoshis to BCH string
 */
export function formatBCH(satoshis: number | bigint): string {
  return (Number(satoshis) / 100_000_000).toFixed(8);
}

/**
 * Format date to readable string
 */
export function formatDate(timestamp: number | Date): string {
  const date =
    typeof timestamp === "number" ? new Date(timestamp * 1000) : timestamp;
  return date.toString();
}

/**
 * Get block explorer URL for a transaction based on network
 */
export function getExplorerUrl(txId: string, network?: Network): string {
  switch (network) {
    case Network.MAINNET:
      return `https://blockchair.com/bitcoin-cash/transaction/${txId}`;
    case Network.TESTNET3:
      return `https://tbch.loping.net/tx/${txId}`;
    case Network.TESTNET4:
      return `https://tbch4.loping.net/tx/${txId}`;
    case Network.CHIPNET:
      return `https://cbch.loping.net/tx/${txId}`;
    default:
      return `txId`;
  }
}

/**
 * Build a markdown table of attempts
 */
export function buildAttemptsTable(attempts: Attempt[]): string {
  return `
  |PR|Author|Status|Date|
  |---|---|---|---|
  ${attempts
    .map(
      (attempt) =>
        `|[${attempt.prNumber}](${attempt.prUrl})|${attempt.contributorLogin}|\`${attempt.status}\`|${formatDate(attempt.createdAt)}|`,
    )
    .join("\n")}
  `;
}
