import { decodeCashAddress } from "@bitauth/libauth";
import { MIN_BOUNTY_BCH, MAX_BOUNTY_BCH } from "./constants";

export type CommandType = "create" | "cancel";

export interface ParsedCommand {
  success: boolean;
  type?: CommandType;
  amount?: number; // BCH amount
  refundAddress?: string;
  expiryDays?: number;
  error?: string;
}

export interface ParsedClaimCommand {
  success: boolean;
  issueNumber?: number;
  contributorAddress?: string;
  error?: string;
}

/**
 * Parse /bounty command from comment
 *
 * Supported formats:
 * - /bounty 2.35 --refund bitcoincash:qp...
 * - /bounty 1.5 --refund bchtest:qp... --expiry 60
 * - /bounty 0.5 --refund bitcoincash:qp... --expiry 90
 */
export function parseCommand(command: string): ParsedCommand {
  const trimmed = command.trim();

  // Check if it starts with /bounty
  if (!trimmed.startsWith("/bounty")) {
    return {
      success: false,
      error: "Command must start with /bounty",
    };
  }

  // Split into tokens
  const tokens = trimmed.split(/\s+/);

  // Remove the /bounty part
  tokens.shift();

  // Check for cancel command
  if (tokens.length >= 1 && tokens[0].toLowerCase() === "cancel") {
    return {
      success: true,
      type: "cancel",
    };
  }

  // Extract amount (first argument)
  if (tokens.length < 1) {
    return {
      success: false,
      error: "Missing amount. Usage: /bounty <amount> --refund <address>",
    };
  }

  const amountStr = tokens[0];
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return {
      success: false,
      error: `Invalid amount: "${amountStr}". Must be a positive number.`,
    };
  }

  // BCH has max supply of 21M, anything above is suspicious
  if (amount > MAX_BOUNTY_BCH) {
    return {
      success: false,
      error: `Amount too large: ${amount}. Maximum is ${MAX_BOUNTY_BCH.toLocaleString()} BCH.`,
    };
  }

  // Minimum bounty to prevent spam - use lowest network minimum at parse time
  // Network-specific validation happens later in handler with validateBountyAmount()
  const lowestMinimum = Math.min(...Object.values(MIN_BOUNTY_BCH));
  if (amount < lowestMinimum) {
    return {
      success: false,
      error: `Amount too small: ${amount}. Minimum is ${lowestMinimum} BCH.`,
    };
  }

  // Parse flags
  let refundAddress: string | undefined;
  let expiryDays: number = 90; // Default to 90 days

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "--refund" || token === "-r") {
      if (i + 1 >= tokens.length) {
        return {
          success: false,
          error: "Missing address after --refund flag",
        };
      }
      refundAddress = tokens[i + 1];
      i++; // Skip next token
    } else if (token === "--expiry" || token === "-e") {
      if (i + 1 >= tokens.length) {
        return {
          success: false,
          error: "Missing days after --expiry flag",
        };
      }
      const expiryStr = tokens[i + 1];
      const parsedExpiry = parseInt(expiryStr, 10);

      if (isNaN(parsedExpiry) || parsedExpiry < 1) {
        return {
          success: false,
          error: `Invalid expiry: "${expiryStr}". Must be a positive number of days.`,
        };
      }

      // Reasonable limits: 1 day to 1 year
      if (parsedExpiry > 365) {
        return {
          success: false,
          error: `Expiry too long: ${parsedExpiry} days. Maximum is 365 days.`,
        };
      }

      expiryDays = parsedExpiry;
      i++; // Skip next token
    }
  }

  // Validate refund address is provided
  if (!refundAddress) {
    return {
      success: false,
      error:
        "Missing --refund flag with address. Usage: /bounty <amount> --refund <address>",
    };
  }

  // Validate address format (basic check)
  if (!isValidBCHAddress(refundAddress)) {
    return {
      success: false,
      error: `Invalid Bitcoin Cash address: "${refundAddress}". Must start with "bitcoincash:" or "bchtest:"`,
    };
  }

  return {
    success: true,
    type: "create",
    amount,
    refundAddress,
    expiryDays,
  };
}

/**
 * Basic validation for BCH address format
 */
export function isValidBCHAddress(address: string): boolean {
  // Check if it starts with bitcoincash: or bchtest:
  if (!address.startsWith("bitcoincash:") && !address.startsWith("bchtest:")) {
    return false;
  }

  // Check if it has the right format (prefix:payload)
  const parts = address.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const payload = parts[1];

  // Check if it starts with q (P2PKH) or p (P2SH)
  // Reject z (P2PKH with tokens) and r (P2SH with tokens)
  if (!payload.startsWith("q") && !payload.startsWith("p")) {
    return false;
  }

  // Basic length check (CashAddr payload is typically 41-42 chars for P2PKH)
  // CashTokens addresses (z/r prefix) are longer, so we reject them
  if (payload.length < 41 || payload.length > 54) {
    return false;
  }

  // Check for valid base32 characters (lowercase + digits)
  const base32Regex = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
  if (!base32Regex.test(payload)) {
    return false;
  }

  // Additional check: try to decode and verify it's 20 bytes (P2PKH)
  try {
    const decoded = decodeCashAddress(address);
    if (typeof decoded === "string") {
      return false;
    }

    // Only accept addresses with 20-byte payload (standard P2PKH)
    // Reject CashTokens addresses which have longer payloads
    if (decoded.payload.length !== 20) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that address prefix matches the expected network
 */
export function validateAddressForNetwork(
  address: string,
  network: string
): { valid: boolean; error?: string } {
  // Only mainnet uses bitcoincash: prefix, all other networks use bchtest:
  const expectedPrefix = network === "mainnet" ? "bitcoincash:" : "bchtest:";
  const wrongPrefix = network === "mainnet" ? "bchtest:" : "bitcoincash:";

  if (address.startsWith(wrongPrefix)) {
    return {
      valid: false,
      error: `This repository uses ${network}. Please provide an address starting with "${expectedPrefix}"`,
    };
  }

  if (!address.startsWith(expectedPrefix)) {
    return {
      valid: false,
      error: `Invalid address prefix. Expected "${expectedPrefix}" for ${network}.`,
    };
  }

  return { valid: true };
}

/**
 * Convert BCH to satoshis
 */
export function bchToSats(bch: number): number {
  return Math.floor(bch * 100_000_000);
}

/**
 * Validate bounty amount for a specific network
 * Returns validation result with error message if invalid
 */
export function validateBountyAmount(
  amount: number,
  network: string
): { valid: boolean; error?: string } {
  if (isNaN(amount) || amount <= 0) {
    return {
      valid: false,
      error: `Invalid amount. Must be a positive number.`,
    };
  }

  // Check maximum (protocol limit)
  if (amount > MAX_BOUNTY_BCH) {
    return {
      valid: false,
      error: `Amount too large: ${amount} BCH. Maximum is ${MAX_BOUNTY_BCH.toLocaleString()} BCH.`,
    };
  }

  // Check minimum (network-specific)
  const minBounty = MIN_BOUNTY_BCH[network] ?? MIN_BOUNTY_BCH["mainnet"];
  if (amount < minBounty) {
    return {
      valid: false,
      error: `Amount too small: ${amount} BCH. Minimum for ${network} is ${minBounty} BCH.`,
    };
  }

  return { valid: true };
}

/**
 * Parse /claim command from PR description
 *
 * Supported formats:
 * - /claim 123 --address bitcoincash:qp...
 * - /claim 456 --address bchtest:qp...
 */
export function parseClaimCommand(command: string): ParsedClaimCommand {
  const trimmed = command.trim();

  // Check if it starts with /claim
  if (!trimmed.startsWith("/claim")) {
    return {
      success: false,
      error: "Command must start with /claim",
    };
  }

  // Split into tokens
  const tokens = trimmed.split(/\s+/);

  // Remove the /claim part
  tokens.shift();

  // Extract issue number (first argument)
  if (tokens.length < 1) {
    return {
      success: false,
      error:
        "Missing issue number. Usage: /claim <issue_number> --address <address>",
    };
  }

  const issueNumberStr = tokens[0];
  const issueNumber = parseInt(issueNumberStr, 10);

  if (isNaN(issueNumber) || issueNumber <= 0) {
    return {
      success: false,
      error: `Invalid issue number: "${issueNumberStr}". Must be a positive integer.`,
    };
  }

  // Parse flags
  let contributorAddress: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "--address" || token === "-a") {
      if (i + 1 >= tokens.length) {
        return {
          success: false,
          error: "Missing address after --address flag",
        };
      }
      contributorAddress = tokens[i + 1];
      i++; // Skip next token
    }
  }

  // Validate address is provided
  if (!contributorAddress) {
    return {
      success: false,
      error:
        "Missing --address flag with address. Usage: /claim <issue_number> --address <address>",
    };
  }

  // Validate address format (basic check)
  if (!isValidBCHAddress(contributorAddress)) {
    return {
      success: false,
      error: `Invalid Bitcoin Cash address: "${contributorAddress}". Must start with "bitcoincash:" or "bchtest:"`,
    };
  }

  return {
    success: true,
    issueNumber,
    contributorAddress,
  };
}
