import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cashAddressToLockingBytecode, decodePrivateKeyWif, decodeTransaction, hexToBin, binToHex } from "@bitauth/libauth";
import { Contract, SignatureTemplate, TransactionBuilder, type Utxo } from "cashscript";
import { createBounty, createConfig, pubkeyToAddress, refundBounty, reconstructContract, type BountyContractInfo, type ContractParams } from "@/lib/contract";
import { assertChainTestEnvironment, CHIPNET_HOST } from "./safety";
import { ElectrumTransportError, isElectrumTransportError, RecoveringElectrumProvider } from "@/lib/electrum-provider";

export const REWARD = BigInt(100_000);
export const ESCROW_FUNDING = REWARD + BigInt(1_000);
const DUST = BigInt(546);

interface Wallet {
  label: string;
  address: string;
  signer: SignatureTemplate;
}

interface Manifest {
  version: 1;
  runId: string;
  network: "chipnet";
  funderAddress: string;
  wallets: string[];
  escrows: ContractParams[];
  transactions: { label: string; txid: string; hex: string }[];
  recoveryErrors: string[];
}

export async function waitFor<T>(description: string, read: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await read();
      if (result !== undefined) return result;
    } catch (error) {
      // A completed set of transport retries is not normal mempool indexing
      // lag. Propagate it so the live suite stops instead of opening more escrows.
      if (isElectrumTransportError(error)) throw error;
    }
    await delay(1500);
  }
  throw new Error(`Timed out waiting for ${description}. Check the transaction manifest before retrying.`);
}

export class ChainHarness {
  readonly config;
  readonly funder: Wallet;
  readonly manifestPath: string;
  private readonly seed: Buffer;
  private readonly manifest: Manifest;

  constructor(recoverPath?: string) {
    assertChainTestEnvironment();
    const decoded = decodePrivateKeyWif(process.env.E2E_FUNDER_WIF!);
    if (typeof decoded === "string" || decoded.type !== "testnet") {
      throw new Error("E2E_FUNDER_WIF must be a compressed testnet WIF. Mainnet keys are never accepted.");
    }
    this.seed = Buffer.from(decoded.privateKey);
    const signer = new SignatureTemplate(decoded.privateKey);
    this.funder = { label: "funder", signer, address: pubkeyToAddress(Buffer.from(signer.getPublicKey()), "testnet3") };
    const runId = `${Date.now()}-${crypto.randomUUID()}`;
    const artifactRoot = process.env.E2E_OFFLINE === "1" ? "e2e-artifacts/offline" : "e2e-artifacts";
    this.manifestPath = recoverPath ? path.resolve(recoverPath) : path.resolve(artifactRoot, runId, "manifest.json");
    this.manifest = recoverPath ? JSON.parse(fs.readFileSync(this.manifestPath, "utf8")) : {
      version: 1, runId, network: "chipnet", funderAddress: this.funder.address,
      wallets: [], escrows: [], transactions: [], recoveryErrors: [],
    };
    if (this.manifest.version !== 1 || this.manifest.network !== "chipnet" || this.manifest.funderAddress !== this.funder.address) {
      throw new Error("Recovery manifest does not match this chipnet funder.");
    }
    if (!/^[a-zA-Z0-9-]+$/.test(this.manifest.runId)) throw new Error("Invalid recovery run ID");

    // Explicitly override environment inherited from a developer's shell.
    process.env.BCH_ELECTRUM_HOST_TESTNET3 = CHIPNET_HOST;
    process.env.NEXT_PUBLIC_BCH_NETWORK = "testnet3";
    process.env.ORACLE_KEY_DIR = path.join(path.dirname(this.manifestPath), "keys");
    fs.mkdirSync(process.env.ORACLE_KEY_DIR, { recursive: true, mode: 0o700 });
    const oracle = this.derive("oracle");
    const oracleSigner = new SignatureTemplate(oracle);
    fs.writeFileSync(path.join(process.env.ORACLE_KEY_DIR, "oracle-key-testnet3.json"), JSON.stringify({
      privateKeyHex: oracle.toString("hex"),
      address: pubkeyToAddress(Buffer.from(oracleSigner.getPublicKey()), "testnet3"),
    }), { mode: 0o600 });
    this.config = createConfig("testnet3", "./contracts/DynamicBounty.cash", "./oracle-key-testnet3.json");
    this.save();
    console.log(`Chipnet funder: ${this.funder.address}\nRecovery manifest: ${this.manifestPath}`);
  }

  private derive(label: string) {
    return crypto.createHmac("sha256", this.seed).update(`issues.cash:chipnet-e2e:v1:${this.manifest.runId}:${label}`).digest();
  }

  private save() {
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }

  wallet(label: string): Wallet {
    if (!this.manifest.wallets.includes(label)) {
      this.manifest.wallets.push(label);
      this.save();
    }
    const signer = new SignatureTemplate(this.derive(`wallet:${label}`));
    return { label, signer, address: pubkeyToAddress(Buffer.from(signer.getPublicKey()), "testnet3") };
  }

  async preflight() {
    await this.config.provider.getBlockHeight();
    const coins = await this.coins(this.funder.address);
    const balance = coins.reduce((sum, coin) => sum + coin.satoshis, BigInt(0));
    // Enough working capital for an escrow, plus cleanup/network fees.
    if (balance < ESCROW_FUNDING + BigInt(50_000)) {
      throw new Error(`Chipnet wallet is low (${balance} sats). Top up ${this.funder.address} with at least 0.002 tBCH. Faucet: https://tbch.googol.cash/`);
    }
  }

  async coins(address: string): Promise<Utxo[]> {
    // Never burn or move CashTokens belonging to the funder.
    return (await this.config.provider.getUtxos(address)).filter((coin) => !coin.token);
  }

  async waitCoins(address: string, minimum: bigint) {
    return waitFor(`at least ${minimum} sats at ${address}`, async () => {
      const coins = await this.coins(address);
      return coins.reduce((sum, coin) => sum + coin.satoshis, BigInt(0)) >= minimum ? coins : undefined;
    });
  }

  async broadcast(label: string, hex: string) {
    const first = crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest();
    const txid = crypto.createHash("sha256").update(first).digest().reverse().toString("hex");
    this.record(label, { txid, hex });
    try {
      await this.config.provider.sendRawTransaction(hex);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Only an explicit script/fee/serialization rejection is proof that the
      // node rejected the transaction. A failed lookup after a TLS error is not.
      if (/mandatory-script-verify|non-mandatory-script-verify|min relay fee not met|tx-size-small|dust|non-final|TX decode failed|bad-txns-(?:vout|vin|oversize|txout|in-belowout)/i.test(message)) {
        this.forgetTransaction(txid);
        throw new Error(`Chipnet transaction broadcast rejected: ${message}`);
      }
      try {
        await this.waitTransaction(txid, 5_000);
      } catch (lookupError) {
        const uncertain = `Chipnet broadcast outcome unknown for ${txid}; signed transaction retained in ${this.manifestPath}.`;
        if (isElectrumTransportError(error) || isElectrumTransportError(lookupError)) {
          throw new ElectrumTransportError(uncertain);
        }
        throw new Error(uncertain);
      }
    }
    await this.waitTransaction(txid);
    return txid;
  }

  record(label: string, transaction: { txid: string; hex: string }) {
    if (!this.manifest.transactions.some((tx) => tx.txid === transaction.txid)) {
      this.manifest.transactions.push({ label, ...transaction });
      this.save();
    }
    console.log(`${label}: https://chipnet.chaingraph.cash/tx/${transaction.txid}`);
  }

  private forgetTransaction(txid: string) {
    const index = this.manifest.transactions.findIndex((transaction) => transaction.txid === txid);
    if (index !== -1) {
      this.manifest.transactions.splice(index, 1);
      this.save();
    }
  }

  async waitTransaction(txid: string, timeoutMs?: number) {
    return waitFor(`transaction ${txid}`, () => this.config.provider.getRawTransaction(txid), timeoutMs);
  }

  async send(wallet: Wallet, address: string, amount?: bigint) {
    if (!address.startsWith("bchtest:")) throw new Error("Refusing a non-testnet destination");
    const coins = (await this.coins(wallet.address)).sort((a, b) => a.satoshis > b.satoshis ? -1 : 1);
    const selected: Utxo[] = [];
    let total = BigInt(0);
    for (const coin of coins) {
      selected.push(coin);
      total += coin.satoshis;
      if (amount !== undefined && total >= amount + BigInt(1_000) + BigInt(selected.length - 1) * BigInt(150)) break;
    }
    if (!selected.length) return undefined;
    const fee = BigInt(1_000) + BigInt(selected.length - 1) * BigInt(150);
    const output = amount ?? total - fee;
    if (output < DUST || total < output + fee) {
      if (amount !== undefined) throw new Error("Insufficient chipnet funds for test transaction");
      throw new Error(`Cannot sweep ${wallet.address}: balance is below fee plus dust. Manifest retained.`);
    }
    const builder = new TransactionBuilder({ provider: this.config.provider });
    builder.addInputs(selected, wallet.signer.unlockP2PKH());
    builder.addOutput({ to: address, amount: output });
    const change = total - output - fee;
    if (change >= DUST) builder.addOutput({ to: wallet.address, amount: change });
    let hex: string;
    try {
      hex = builder.build();
      builder.debug();
    } catch {
      // CashScript's debug errors may include private keys in a Bitauth URI.
      throw new Error("Test wallet transaction construction failed; signing details withheld.");
    }
    return this.broadcast(`${wallet.label} → ${address}`, hex);
  }

  escrow(label: string, refundAddress: string, expiredLocktime?: number): BountyContractInfo {
    let info = createBounty(this.config, `chipnet-e2e:${this.manifest.runId}:${label}`, refundAddress, 1);
    if (expiredLocktime !== undefined) {
      const contract = new Contract(this.config.artifact, [
        this.config.oracleKeys.publicKey, Buffer.from(info.maintainerPKH, "hex"),
        Buffer.from(info.issueHash, "hex"), BigInt(expiredLocktime),
      ], { provider: this.config.provider });
      info = { ...info, contract, address: contract.address, locktime: expiredLocktime };
    }
    this.trackEscrow(info);
    return info;
  }

  trackEscrow(info: Pick<BountyContractInfo, "address" | "issueHash" | "locktime" | "maintainerPKH" | "oraclePubkey">) {
    if (!this.manifest.escrows.some((escrow) => escrow.address === info.address)) {
      this.manifest.escrows.push({
        address: info.address, issueHash: info.issueHash, locktime: info.locktime,
        maintainerPKH: info.maintainerPKH, oraclePubkey: info.oraclePubkey,
      });
      this.save();
    }
  }

  async fund(address: string, amount = ESCROW_FUNDING) {
    const txid = await this.send(this.funder, address, amount);
    if (!txid) throw new Error("Funder wallet has no spendable coins");
    await this.waitCoins(address, amount);
    return txid;
  }

  async medianTimePast() {
    const height = await this.config.provider.getBlockHeight();
    const response = await this.config.provider.performRequest("blockchain.block.headers", height - 10, 11) as { hex: string; count: number };
    if (response.count !== 11) throw new Error("Could not retrieve 11 headers for median-time-past");
    const headers = Buffer.from(response.hex, "hex");
    return Array.from({ length: 11 }, (_, i) => headers.readUInt32LE(i * 80 + 68)).sort((a, b) => a - b)[5];
  }

  async outputs(txid: string) {
    const transaction = decodeTransaction(hexToBin(await this.waitTransaction(txid)));
    if (typeof transaction === "string") throw new Error("Could not decode broadcast transaction");
    return transaction;
  }

  async assertOutput(txid: string, address: string, amount: bigint) {
    const expected = cashAddressToLockingBytecode(address);
    if (typeof expected === "string") throw new Error("Invalid expected address");
    const tx = await this.outputs(txid);
    if (!tx.outputs.some((output) => output.valueSatoshis === amount && binToHex(output.lockingBytecode) === binToHex(expected.bytecode))) {
      throw new Error(`Transaction ${txid} did not pay ${amount} sats to ${address}`);
    }
  }

  async cleanup(recoverSavedTransactions = false) {
    const errors: string[] = [];
    // Do not reuse a socket that just failed during the test. This is a no-op
    // for the offline VM and resets only the connection, never transaction data.
    await this.close();
    const recoveryFailed = (context: string, error: unknown) => {
      errors.push(context);
      if (isElectrumTransportError(error)) {
        errors.push("Electrum unavailable; remaining recovery checks were skipped, not verified as failed.");
        this.manifest.recoveryErrors = errors;
        this.save();
        throw new ElectrumTransportError(`Cleanup stopped: ${errors.join("\n")}\nRecover using ${this.manifestPath} with the original funder WIF.`);
      }
    };
    if (recoverSavedTransactions) {
      // A process may have stopped between saving and broadcasting a transaction,
      // or lost the broadcast reply. This is intentionally recovery-only: checking
      // every historical transaction after each test makes the normal suite O(n²).
      for (const tx of this.manifest.transactions) {
        try {
          try { await this.config.provider.getRawTransaction(tx.txid); }
          catch {
            try { await this.config.provider.sendRawTransaction(tx.hex); }
            catch { /* It may already be in the node's mempool or chain. */ }
            await this.waitTransaction(tx.txid, 5_000);
          }
        } catch (error) { recoveryFailed(`Saved transaction recovery failed: ${tx.txid}`, error); }
      }
    }
    for (const params of this.manifest.escrows) {
      try {
        if (!(await this.coins(params.address)).length) continue;
        const contract = reconstructContract(this.config.artifact, params, this.config.provider);
        // Refund to the contract's actual maintainer, then sweep that test wallet.
        const maintainer = this.manifest.wallets.map((label) => this.wallet(label)).find((wallet) => {
          const script = cashAddressToLockingBytecode(wallet.address);
          return typeof script !== "string" && binToHex(script.bytecode).includes(params.maintainerPKH);
        });
        if (!maintainer) throw new Error("Maintainer recovery wallet not found");
        const refund = await refundBounty(contract, this.config.provider, maintainer.address, params.issueHash, this.config.oracleKeys.privateKey);
        this.record("cleanup escrow refund", refund.transaction);
        await this.waitCoins(maintainer.address, refund.refundedAmount);
      } catch (error) { recoveryFailed(`Escrow recovery failed: ${params.address}`, error); }
    }
    // Include the oracle's commission output in the sweep.
    const oracleSigner = new SignatureTemplate(this.derive("oracle"));
    const wallets = this.manifest.wallets.map((label) => this.wallet(label));
    wallets.push({ label: "oracle", signer: oracleSigner, address: this.config.oracleKeys.address });
    for (const wallet of wallets) {
      try { await this.send(wallet, this.funder.address); }
      catch (error) { recoveryFailed(`Wallet recovery failed: ${wallet.address}`, error); }
    }
    this.manifest.recoveryErrors = errors;
    this.save();
    if (errors.length) throw new Error(`${errors.join("\n")}\nUse E2E_RECOVER_MANIFEST=${this.manifestPath} with the original funder WIF.`);
  }

  async close() {
    if (this.config.provider instanceof RecoveringElectrumProvider) await this.config.provider.disconnect();
  }
}
