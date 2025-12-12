export interface ParsedCommand {
  success: boolean;
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
  if (amount > 21_000_000) {
    return {
      success: false,
      error: `Amount too large: ${amount}. Maximum is 21,000,000 BCH.`,
    };
  }

  // Minimum bounty to prevent spam (0.0001 BCH = ~$0.04)
  if (amount < 0.0001) {
    return {
      success: false,
      error: `Amount too small: ${amount}. Minimum is 0.0001 BCH.`,
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
    amount,
    refundAddress,
    expiryDays,
  };
}

/**
 * Basic validation for BCH address format
 */
function isValidBCHAddress(address: string): boolean {
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

  // Basic length check (CashAddr payload is typically 42 chars for P2PKH)
  // q/p prefix + 40 chars + optional checksum
  if (payload.length < 42 || payload.length > 100) {
    return false;
  }

  // Check if it starts with q (P2PKH) or p (P2SH)
  if (!payload.startsWith("q") && !payload.startsWith("p")) {
    return false;
  }

  // Check for valid base32 characters (lowercase + digits)
  const base32Regex = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
  if (!base32Regex.test(payload)) {
    return false;
  }

  return true;
}

/**
 * Convert BCH to satoshis
 */
export function bchToSats(bch: number): number {
  return Math.floor(bch * 100_000_000);
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
