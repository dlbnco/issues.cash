import type { Attempt } from "@prisma/client";
import { Network } from "cashscript";

interface FormatBCHOptions {
  /** Include "BCH" symbol suffix (default: false) */
  symbol?: boolean;
  /** Strip trailing zeros (default: false) */
  stripZeros?: boolean;
}

/**
 * Format satoshis to BCH string
 * @param satoshis - Amount in satoshis
 * @param options - Formatting options
 * @returns Formatted BCH string
 *
 * @example
 * formatBCH(123450000) // "1.23450000"
 * formatBCH(123450000, { symbol: true }) // "1.2345 BCH"
 * formatBCH(123450000, { stripZeros: true }) // "1.2345"
 * formatBCH(123450000, { symbol: true, stripZeros: true }) // "1.2345 BCH"
 */
export function formatBCH(
  satoshis: number | bigint,
  options?: FormatBCHOptions,
): string {
  const { symbol = false, stripZeros = false } = options ?? {};
  const bch = Number(satoshis) / 100_000_000;

  // Strip trailing zeros using parseFloat, or keep full precision
  const formatted = (stripZeros || symbol) ? String(parseFloat(bch.toFixed(8))) : bch.toFixed(8);

  return symbol ? `${formatted} BCH` : formatted;
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
