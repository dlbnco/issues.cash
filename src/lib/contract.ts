import {
  Artifact,
  Contract,
  ElectrumNetworkProvider,
  Network,
  TransactionBuilder,
  SignatureTemplate,
} from "cashscript";
import { compileFile } from "cashc";
import {
  binToHex,
  CashAddressType,
  decodeCashAddress,
  encodeCashAddress,
  hexToBin,
} from "@bitauth/libauth";
import crypto from "crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import fs from "fs";
import { UNLOCKING_TX_FEE_AMOUNT } from "./constants";

export interface OracleKeys {
  privateKey: Buffer;
  publicKey: Buffer;
  address: string;
}

export interface BountyContractInfo {
  contract: Contract;
  address: string;
  issueHash: string;
  issueUrl: string;
  maintainerAddress: string;
  maintainerPKH: string;
  locktime: number;
  expiryDate: string;
  oraclePubkey: string;
}

export interface ContractParams {
  address: string;
  oraclePubkey: string;
  maintainerPKH: string;
  issueHash: string;
  locktime: number;
}

export interface BalanceInfo {
  address: string;
  confirmed: bigint;
  funded: boolean;
  utxoCount?: number;
  error?: string;
}

export interface UTXO {
  txid: string;
  vout: number;
  satoshis: bigint;
}

export interface Config {
  network: Network;
  provider: ElectrumNetworkProvider;
  artifact: Artifact;
  oracleKeys: OracleKeys;
}

/**
 * Convert BCH address to PKH (hash160)
 */
export function addressToPKH(address: string): Buffer {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === "string")
    throw new Error("Invalid CashAddress payload");

  // Return just the payload (PKH), which is 20 bytes
  return Buffer.from(decoded.payload);
}

/**
 * Convert PKH to BCH address
 */
export function pkhToAddress(pkh: Buffer | string, network: Network): string {
  const pkhString = Buffer.isBuffer(pkh) ? pkh.toString("hex") : pkh;
  const decoded = decodeCashAddress(pkhString);
  if (typeof decoded === "string")
    throw new Error("Invalid CashAddress payload");
  const encoded = encodeCashAddress({
    type: CashAddressType.p2pkhWithTokens,
    payload: decoded.payload,
    prefix: network !== "mainnet" ? "bchtest" : undefined,
  });
  return encoded.address;
}

/**
 * Convert public key to address
 */
export function pubkeyToAddress(pubkey: Buffer, network: Network): string {
  const pubkeyBuffer = Buffer.isBuffer(pubkey)
    ? pubkey
    : Buffer.from(pubkey, "hex");

  // Hash160 of public key
  const hash256 = crypto.createHash("sha256").update(pubkeyBuffer).digest();
  const pkh = crypto.createHash("ripemd160").update(hash256).digest();

  return pkhToAddress(pkh, network);
}

/**
 * Convert public key to PKH (hash160)
 */
export function pubkeyToPKH(pubkey: Buffer): Buffer {
  const pubkeyBuffer = Buffer.isBuffer(pubkey)
    ? pubkey
    : Buffer.from(pubkey, "hex");

  // Hash160 of public key
  const hash256 = crypto.createHash("sha256").update(pubkeyBuffer).digest();
  const pkh = crypto.createHash("ripemd160").update(hash256).digest();

  return pkh;
}

/**
 * Get oracle fee PKH for commission payments
 * Derived from oracle public key
 */
export function getOracleFeePKH(oracleKeys: OracleKeys): Buffer {
  return pubkeyToPKH(oracleKeys.publicKey);
}

/**
 * Get oracle fee address for commission payments
 * Derived from oracle public key
 */
export function getOracleFeeAddress(
  oracleKeys: OracleKeys,
  network: Network
): string {
  return pubkeyToAddress(oracleKeys.publicKey, network);
}

/**
 * Load oracle keys from file
 */
export function loadOracleKeys(
  keyPath: string = "./oracle-key.json",
): OracleKeys {
  try {
    const keys = JSON.parse(fs.readFileSync(keyPath, "utf8"));

    const privateKey = Buffer.from(hexToBin(keys.privateKeyHex));
    const publicKey = Buffer.from(secp256k1.getPublicKey(privateKey, true));

    console.log("✅ Oracle keys loaded from", keyPath);

    return {
      privateKey,
      publicKey,
      address: keys.address,
    };
  } catch (error) {
    throw new Error(
      `Failed to load oracle keys from ${keyPath}: ${(error as Error).message}`,
    );
  }
}

/**
 * Generate new oracle keys
 */
export function generateOracleKeys(
  keyPath: string = "./oracle-key.json",
  network: Network,
): OracleKeys {
  console.log("⚠️  Generating new oracle keys...");

  // Generate random 32-byte private key
  const privateKey = crypto.randomBytes(32);

  // Derive compressed public key (33 bytes)
  const publicKey = Buffer.from(secp256k1.getPublicKey(privateKey, true));

  // Derive address
  const address = pubkeyToAddress(publicKey, network);

  // Save to file
  const keys = {
    privateKeyHex: binToHex(privateKey),
    publicKeyHex: binToHex(publicKey),
    address,
    network,
  };

  fs.writeFileSync(keyPath, JSON.stringify(keys, null, 2));

  console.log("💾 Oracle keys saved to", keyPath);
  console.log(`   Address: ${address}`);
  console.log("⚠️  BACKUP THIS FILE! It cannot be recovered if lost.");

  return { privateKey, publicKey, address };
}

/**
 * Get or create oracle keys
 */
export function getOracleKeys(
  keyPath: string = "./oracle-key.json",
  network: Network,
): OracleKeys {
  try {
    return loadOracleKeys(keyPath);
  } catch (error) {
    console.error(error);
    return generateOracleKeys(keyPath, network);
  }
}

/**
 * Compile CashScript contract
 */
export function compileContract(
  contractPath: string = "./contracts/DynamicBounty.cash",
): Artifact {
  console.log("📝 Compiling contract:", contractPath);

  const artifact = compileFile(contractPath);

  console.log("✅ Contract compiled");
  console.log(`   Bytecode size: ${artifact.bytecode.length} bytes`);

  return artifact;
}

/**
 * Create Electrum network provider
 */
export function createProvider(network: Network): ElectrumNetworkProvider {
  const provider = new ElectrumNetworkProvider(network);
  console.log(`🔌 Connected to Electrum (${network})`);
  return provider;
}

/**
 * Create a bounty contract instance
 */
export function createBountyContract(
  artifact: Artifact,
  oraclePubkey: Buffer,
  maintainerAddress: string,
  issueUrl: string,
  expiryDays: number,
  provider: ElectrumNetworkProvider,
): BountyContractInfo {
  console.log("🎯 Creating bounty contract...");
  console.log(`   Issue: ${issueUrl}`);
  console.log(`   Maintainer: ${maintainerAddress}`);

  // Generate issue hash (unique identifier)
  const issueHash = crypto.createHash("sha256").update(issueUrl).digest();
  console.log(`   Issue hash: ${issueHash.toString("hex")}`);

  // Convert maintainer address to PKH
  const maintainerPKH = addressToPKH(maintainerAddress);
  console.log(`   Maintainer PKH: ${maintainerPKH.toString("hex")}`);

  // Calculate locktime (CashScript expects BigInt for int types)
  const locktime = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;
  const expiryDate = new Date(locktime * 1000);
  console.log(`   Locktime: ${locktime} (${expiryDate.toISOString()})`);

  // Instantiate contract
  const contract = new Contract(
    artifact,
    [oraclePubkey, maintainerPKH, issueHash, BigInt(locktime)],
    { provider },
  );

  console.log("✅ Contract created!");
  console.log(`   Address: ${contract.address}`);

  return {
    contract,
    address: contract.address,
    issueHash: issueHash.toString("hex"),
    issueUrl,
    maintainerAddress,
    maintainerPKH: maintainerPKH.toString("hex"),
    locktime,
    expiryDate: expiryDate.toISOString(),
    oraclePubkey: oraclePubkey.toString("hex"),
  };
}

/**
 * Reconstruct contract from stored parameters
 */
export function reconstructContract(
  artifact: Artifact,
  params: ContractParams,
  provider: ElectrumNetworkProvider,
): Contract {
  const contract = new Contract(
    artifact,
    [
      Buffer.from(params.oraclePubkey, "hex"),
      Buffer.from(params.maintainerPKH, "hex"),
      Buffer.from(params.issueHash, "hex"),
      BigInt(params.locktime),
    ],
    { provider },
  );

  // Verify address matches
  if (contract.address !== params.address) {
    throw new Error("Contract reconstruction failed - address mismatch");
  }

  console.log("✅ Contract reconstructed:", contract.address);

  return contract;
}

/**
 * Check contract balance
 */
export async function checkContractBalance(
  contractAddress: string,
  provider: ElectrumNetworkProvider,
): Promise<BalanceInfo> {
  try {
    const utxos = await provider.getUtxos(contractAddress);
    const confirmed = utxos.reduce(
      (sum, utxo) => BigInt(sum) + utxo.satoshis,
      BigInt(0),
    );

    return {
      address: contractAddress,
      confirmed,
      funded: confirmed > 0,
      utxoCount: utxos.length,
    };
  } catch (error) {
    console.error("Error checking balance:", error);
    return {
      address: contractAddress,
      confirmed: BigInt(0),
      funded: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get contract UTXOs
 */
export async function getContractUTXOs(
  contractAddress: string,
  provider: ElectrumNetworkProvider,
): Promise<UTXO[]> {
  try {
    const utxos = await provider.getUtxos(contractAddress);
    console.log(`📦 Found ${utxos.length} UTXOs for contract`);

    return utxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: utxo.satoshis,
    }));
  } catch (error) {
    console.error("Error fetching UTXOs:", error);
    return [];
  }
}

/**
 * Create configuration object with all dependencies
 */
export function createConfig(
  network: Network,
  contractPath: string = "./contracts/DynamicBounty.cash",
  keyPath: string = "./oracle-key.json",
): Config {
  return {
    network,
    provider: createProvider(network),
    artifact: compileContract(contractPath),
    oracleKeys: getOracleKeys(keyPath, network),
  };
}

/**
 * Create a new bounty (high-level function)
 */
export function createBounty(
  config: Config,
  issueUrl: string,
  maintainerAddress: string,
  expiryDays: number = 90,
): BountyContractInfo {
  return createBountyContract(
    config.artifact,
    config.oracleKeys.publicKey,
    maintainerAddress,
    issueUrl,
    expiryDays,
    config.provider,
  );
}

/**
 * Check if bounty is funded
 */
export async function checkBountyFunding(
  config: Config,
  contractAddress: string,
): Promise<BalanceInfo> {
  return await checkContractBalance(contractAddress, config.provider);
}

/**
 * Reconstruct bounty contract
 */
export function rebuildBountyContract(
  config: Config,
  params: ContractParams,
): Contract {
  return reconstructContract(config.artifact, params, config.provider);
}

export interface TransactionResult {
  txid: string;
  hex: string;
}

/**
 * Sign a message with the oracle private key using CashScript's SignatureTemplate
 * Returns a signature for OP_CHECKDATASIG
 *
 * The opcode internally hashes the message with SHA256 before verifying.
 */
export function signOracleMessage(
  message: Buffer,
  oraclePrivateKey: Buffer,
): Uint8Array {
  // Hash the message with SHA256 (checkDataSig verifies against SHA256(msg))
  const messageHash = crypto.createHash("sha256").update(message).digest();

  // Use CashScript's SignatureTemplate to sign the message hash
  const sigTemplate = new SignatureTemplate(oraclePrivateKey);
  const signature = sigTemplate.signMessageHash(messageHash);

  return signature;
}

/**
 * Complete bounty - Pay contributor after PR merged
 *
 * Oracle signs: "COMPLETE" + issueHash + contributorPKH + contributorAmount + oracleFeePKH + commissionAmount
 *
 * @param contract - The bounty contract instance
 * @param provider - The Electrum network provider
 * @param contributorAddress - BCH address of the contributor to pay
 * @param contributorAmount - Amount to pay contributor (in satoshis)
 * @param issueHash - SHA256 hash of the issue URL (hex string)
 * @param oraclePrivateKey - Oracle's private key for signing
 * @param oracleFeePKH - Oracle fee PKH for commission (null if no commission)
 * @param commissionAmount - Commission amount for oracle (0 if no commission)
 * @returns Transaction result with txid and hex
 */
export async function completeBounty(
  contract: Contract,
  provider: ElectrumNetworkProvider,
  contributorAddress: string,
  contributorAmount: bigint,
  issueHash: string,
  oraclePrivateKey: Buffer,
  oracleFeePKH: Buffer | null,
  commissionAmount: bigint,
): Promise<TransactionResult> {
  console.log("💰 Completing bounty...");
  console.log(`   Contributor: ${contributorAddress}`);
  console.log(`   Contributor amount: ${contributorAmount} satoshis`);
  if (commissionAmount > 0) {
    console.log(`   Commission: ${commissionAmount} satoshis`);
  }

  // Convert contributor address to PKH
  const contributorPKH = addressToPKH(contributorAddress);
  console.log(`   Contributor PKH: ${contributorPKH.toString("hex")}`);

  // Use zero PKH if no commission (contract still expects the parameter)
  const effectiveOracleFeePKH = oracleFeePKH ?? Buffer.alloc(20, 0);

  // Convert amounts to 8-byte little-endian buffers
  const contributorAmountBuffer = Buffer.alloc(8);
  contributorAmountBuffer.writeBigInt64LE(contributorAmount);

  const commissionAmountBuffer = Buffer.alloc(8);
  commissionAmountBuffer.writeBigInt64LE(commissionAmount);

  // Construct the message that oracle signs
  // Format: "COMPLETE" + issueHash + contributorPKH + contributorAmount + oracleFeePKH + commissionAmount
  const message = Buffer.concat([
    Buffer.from("COMPLETE"),
    Buffer.from(issueHash, "hex"),
    contributorPKH,
    contributorAmountBuffer,
    effectiveOracleFeePKH,
    commissionAmountBuffer,
  ]);

  // Sign the message
  const oracleSig = signOracleMessage(message, oraclePrivateKey);
  console.log(
    `   Oracle signature: ${Buffer.from(oracleSig).toString("hex").slice(0, 32)}...`,
  );

  // Get contract UTXOs
  const utxos = await contract.getUtxos();
  console.log(`   Found ${utxos.length} UTXOs`);

  if (utxos.length === 0) {
    throw new Error("Contract has no funds");
  }

  if (utxos.length > 1) {
    console.warn(
      `   Warning: Contract has ${utxos.length} UTXOs, using first one only`,
    );
  }

  // Use only the first UTXO
  const utxo = utxos[0];
  const inputValue = utxo.satoshis;
  console.log(`   Input value: ${inputValue} satoshis`);

  // Verify contract has enough funds
  const totalOutput = contributorAmount + commissionAmount;
  if (inputValue < totalOutput) {
    throw new Error(`Insufficient funds: ${inputValue} < ${totalOutput}`);
  }

  // Build transaction using TransactionBuilder
  const txBuilder = new TransactionBuilder({ provider });

  // Add contract UTXO as input with the complete unlocker
  const unlocker = contract.unlock.complete(
    contributorPKH,
    contributorAmount,
    effectiveOracleFeePKH,
    commissionAmount,
    oracleSig
  );
  txBuilder.addInput(utxo, unlocker);

  // Add output to contributor
  txBuilder.addOutput({ to: contributorAddress, amount: contributorAmount });

  // Add commission output if commission > 0
  if (commissionAmount > 0 && oracleFeePKH) {
    // Convert PKH to address for the output
    // We need to determine the network from the contributor address prefix
    const isTestnet = contributorAddress.startsWith("bchtest:");
    const network: Network = isTestnet ? "testnet3" : "mainnet";
    const oracleFeeAddress = pkhToAddress(oracleFeePKH, network);
    txBuilder.addOutput({ to: oracleFeeAddress, amount: commissionAmount });
    console.log(`   Oracle fee address: ${oracleFeeAddress}`);
  }

  // Send transaction
  const tx = await txBuilder.send();

  console.log("✅ Bounty completed!");
  console.log(`   TX: ${tx.txid}`);

  return {
    txid: tx.txid,
    hex: tx.hex,
  };
}

/**
 * Refund bounty - Return funds to maintainer
 *
 * Oracle signs: "REFUND" + issueHash + amount
 *
 * @param contract - The bounty contract instance
 * @param provider - The Electrum network provider
 * @param maintainerAddress - BCH address of the maintainer to refund
 * @param issueHash - SHA256 hash of the issue URL (hex string)
 * @param amount - Exact refund amount (in satoshis)
 * @param oraclePrivateKey - Oracle's private key for signing
 * @returns Transaction result with txid and hex
 */
export async function refundBounty(
  contract: Contract,
  provider: ElectrumNetworkProvider,
  maintainerAddress: string,
  issueHash: string,
  amount: bigint,
  oraclePrivateKey: Buffer,
): Promise<TransactionResult> {
  console.log("↩️  Refunding bounty...");
  console.log(`   Maintainer: ${maintainerAddress}`);
  console.log(`   Amount: ${amount} satoshis`);

  // Convert amount to 8-byte little-endian buffer
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigInt64LE(amount);

  // Construct the refund message
  // Format: "REFUND" + issueHash + amount (8 bytes LE)
  const message = Buffer.concat([
    Buffer.from("REFUND"),
    Buffer.from(issueHash, "hex"),
    amountBuffer,
  ]);

  // Sign the message
  const oracleSig = signOracleMessage(message, oraclePrivateKey);
  console.log(
    `   Oracle signature: ${Buffer.from(oracleSig).toString("hex").slice(0, 32)}...`,
  );

  // Get contract UTXOs
  const utxos = await contract.getUtxos();
  console.log(`   Found ${utxos.length} UTXOs`);

  if (utxos.length === 0) {
    throw new Error("Contract has no funds");
  }

  if (utxos.length > 1) {
    console.warn(
      `   Warning: Contract has ${utxos.length} UTXOs, using first one only`,
    );
  }

  // Use only the first UTXO
  const utxo = utxos[0];
  const inputValue = utxo.satoshis;
  console.log(`   Input value: ${inputValue} satoshis`);

  // Verify contract has enough funds
  if (inputValue < amount) {
    throw new Error(`Insufficient funds: ${inputValue} < ${amount}`);
  }

  // Build transaction using TransactionBuilder
  const txBuilder = new TransactionBuilder({ provider });

  // Add contract UTXO as input with the refund unlocker
  const unlocker = contract.unlock.refund(amount, oracleSig);
  txBuilder.addInput(utxo, unlocker);

  // Add output to maintainer (exact refund amount)
  txBuilder.addOutput({ to: maintainerAddress, amount });

  // Send transaction
  const tx = await txBuilder.send();

  console.log("✅ Bounty refunded!");
  console.log(`   TX: ${tx.txid}`);

  return {
    txid: tx.txid,
    hex: tx.hex,
  };
}

/**
 * Timeout bounty - Automatic refund after expiry
 *
 * No oracle signature needed - anyone can trigger this after locktime
 *
 * @param contract - The bounty contract instance
 * @param provider - The Electrum network provider
 * @param maintainerAddress - BCH address of the maintainer to refund
 * @param locktime - Unix timestamp when bounty expires
 * @returns Transaction result with txid and hex
 */
export async function timeoutBounty(
  contract: Contract,
  provider: ElectrumNetworkProvider,
  maintainerAddress: string,
  locktime: number,
): Promise<TransactionResult> {
  console.log("⏰ Processing timeout refund...");
  console.log(`   Maintainer: ${maintainerAddress}`);
  console.log(
    `   Locktime: ${locktime} (${new Date(locktime * 1000).toISOString()})`,
  );

  // Check if locktime has passed
  const now = Math.floor(Date.now() / 1000);
  if (now < locktime) {
    const remaining = locktime - now;
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    throw new Error(
      `Locktime not reached. ${days} days and ${hours} hours remaining.`,
    );
  }

  // Get contract UTXOs
  const utxos = await contract.getUtxos();
  console.log(`   Found ${utxos.length} UTXOs`);

  if (utxos.length === 0) {
    throw new Error("Contract has no funds");
  }

  if (utxos.length > 1) {
    console.warn(
      `   Warning: Contract has ${utxos.length} UTXOs, using first one only`,
    );
  }

  // Use only the first UTXO (contract checks per-input value)
  const utxo = utxos[0];
  const inputValue = utxo.satoshis;
  console.log(`   Input value: ${inputValue} satoshis`);

  // Build transaction using TransactionBuilder
  const txBuilder = new TransactionBuilder({ provider });

  // Add contract UTXO as input with the timeout unlocker
  const unlocker = contract.unlock.timeout();
  txBuilder.addInput(utxo, unlocker);

  // Add output to maintainer (input value minus fee, max 1000 sats as per contract)
  const fee = UNLOCKING_TX_FEE_AMOUNT;
  const outputAmount = inputValue - fee;
  txBuilder.addOutput({ to: maintainerAddress, amount: outputAmount });

  // Set locktime on the transaction
  txBuilder.setLocktime(locktime);

  // Send transaction
  const tx = await txBuilder.send();

  console.log("✅ Timeout refund completed!");
  console.log(`   TX: ${tx.txid}`);

  return {
    txid: tx.txid,
    hex: tx.hex,
  };
}
