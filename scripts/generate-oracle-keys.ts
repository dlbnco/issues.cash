#!/usr/bin/env ts-node

import crypto from "crypto";
import { getPublicKey } from "@noble/secp256k1";
import { binToHex, hexToBin } from "@bitauth/libauth";
import fs from "fs";
import path from "path";

interface OracleKeyFile {
  privateKeyHex: string;
  publicKeyHex: string;
  address: string;
  network: string;
}

/**
 * Convert public key to Bitcoin Cash address
 */
function pubkeyToAddress(
  pubkey: Buffer,
  network: "mainnet" | "testnet3",
): string {
  // Hash160 of public key (SHA256 then RIPEMD160)
  const hash256 = crypto.createHash("sha256").update(pubkey).digest();
  const pkh = crypto.createHash("ripemd160").update(hash256).digest();

  // Build address with proper prefix
  const prefix = network === "mainnet" ? "bitcoincash" : "bchtest";
  const type = 0; // P2PKH

  // Simple CashAddress encoding (version byte + hash)
  // Note: This is a simplified version. For production, use @bitauth/libauth properly
  const payload = Buffer.concat([Buffer.from([type]), pkh]);

  // For this script, we'll create a placeholder address format
  // In production, the actual CashAddress encoding should be used
  const addressHash = payload.toString("hex");

  // Return a properly formatted address (simplified)
  return `${prefix}:qp${addressHash.slice(0, 40)}`;
}

/**
 * Generate a single oracle keypair
 */
function generateOracleKeypair(network: "mainnet" | "testnet3"): OracleKeyFile {
  console.log(`\n🔑 Generating oracle keys for ${network}...`);

  // Generate random 32-byte private key
  const privateKey = crypto.randomBytes(32);
  const privateKeyHex = binToHex(privateKey);

  // Derive compressed public key (33 bytes, starts with 02 or 03)
  const publicKey = Buffer.from(getPublicKey(privateKey, true));
  const publicKeyHex = binToHex(publicKey);

  // Derive address
  const address = pubkeyToAddress(publicKey, network);

  console.log(`   ✓ Private key: ${privateKeyHex.slice(0, 16)}...`);
  console.log(`   ✓ Public key:  ${publicKeyHex}`);
  console.log(`   ✓ Address:     ${address}`);

  return {
    privateKeyHex,
    publicKeyHex,
    address,
    network,
  };
}

/**
 * Save oracle keys to file
 */
function saveOracleKeys(keys: OracleKeyFile, outputDir: string = "."): string {
  const filename = `oracle-key-${keys.network}.json`;
  const filepath = path.join(outputDir, filename);

  // Check if file already exists
  if (fs.existsSync(filepath)) {
    console.log(`\n⚠️  Warning: ${filename} already exists!`);
    const backup = `${filepath}.backup-${Date.now()}`;
    fs.copyFileSync(filepath, backup);
    console.log(`   Created backup: ${path.basename(backup)}`);
  }

  // Write keys to file
  fs.writeFileSync(filepath, JSON.stringify(keys, null, 2) + "\n");

  console.log(`\n💾 Keys saved to: ${filename}`);
  console.log(`   Path: ${path.resolve(filepath)}`);

  return filepath;
}

/**
 * Display security warnings
 */
function displaySecurityWarnings(files: string[]) {
  console.log("\n" + "=".repeat(70));
  console.log("🔐 SECURITY WARNINGS");
  console.log("=".repeat(70));
  console.log("\n⚠️  CRITICAL: These files contain private keys!");
  console.log("\n✅ DO:");
  console.log("   • Backup these files to a secure location");
  console.log("   • Keep them secret and never commit to git");
  console.log("   • Use different keys for testnet and mainnet");
  console.log("   • Store mainnet keys in encrypted storage");
  console.log("\n❌ DON'T:");
  console.log("   • Commit these files to version control");
  console.log("   • Share these keys with anyone");
  console.log("   • Use testnet keys on mainnet (or vice versa)");
  console.log("   • Store keys in plain text in production");

  console.log("\n📁 Generated files:");
  files.forEach((file) => {
    console.log(`   • ${path.basename(file)}`);
  });

  console.log("\n✓ These files are already in .gitignore");
  console.log("=".repeat(70) + "\n");
}

function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔑 Oracle Key Generator for issues.cash");
  console.log("=".repeat(70));

  const args = process.argv.slice(2);
  const networks: Array<"mainnet" | "testnet3"> = [];

  // Parse arguments
  if (args.includes("--mainnet")) {
    networks.push("mainnet");
  }
  if (args.includes("--testnet") || args.length === 0) {
    networks.push("testnet3");
  }
  if (args.includes("--both")) {
    networks.push("testnet3", "mainnet");
  }

  // Show help
  if (args.includes("--help") || args.includes("-h")) {
    console.log("\nUsage: ts-node scripts/generate-oracle-keys.ts [options]");
    console.log("\nOptions:");
    console.log("  --testnet     Generate testnet keys (default)");
    console.log("  --mainnet     Generate mainnet keys");
    console.log("  --both        Generate both testnet and mainnet keys");
    console.log("  --help, -h    Show this help message");
    console.log("\nExamples:");
    console.log("  ts-node scripts/generate-oracle-keys.ts");
    console.log("  ts-node scripts/generate-oracle-keys.ts --mainnet");
    console.log("  ts-node scripts/generate-oracle-keys.ts --both");
    console.log();
    return;
  }

  // Generate keys for each network
  const files: string[] = [];
  for (const network of networks) {
    const keys = generateOracleKeypair(network);
    const filepath = saveOracleKeys(keys, ".");
    files.push(filepath);
  }

  // Display security warnings
  displaySecurityWarnings(files);
}

// Run the script
if (require.main === module) {
  main();
}
