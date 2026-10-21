import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { encodePrivateKeyWif } from "@bitauth/libauth";
import { MockNetworkProvider, type ElectrumNetworkProvider } from "cashscript";
import { completeBounty, refundBounty } from "@/lib/contract";
import { ChainHarness, REWARD } from "./chain";
import { ElectrumTransportError } from "@/lib/electrum-provider";

let chain: ChainHarness;
let provider: MockNetworkProvider;
beforeEach(() => {
  vi.stubEnv("E2E_RUN_CHIPNET", "1");
  vi.stubEnv("NEXT_PUBLIC_BCH_NETWORK", "testnet3");
  vi.stubEnv("BCH_ELECTRUM_HOST_TESTNET3", "chipnet.bch.ninja");
  vi.stubEnv("E2E_FUNDER_WIF", encodePrivateKeyWif(new Uint8Array(32).fill(1), "testnet"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  chain = new ChainHarness();
  provider = new MockNetworkProvider({ updateUtxoSet: true });
  chain.config.provider = provider as unknown as ElectrumNetworkProvider;
  provider.addUtxo(chain.funder.address, { txid: "11".repeat(32), vout: 0, satoshis: BigInt(1_000_000) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

test("builds valid funding, payout and cleanup transactions using the real BCH VM", async () => {
  const creator = chain.wallet("creator");
  const claimant = chain.wallet("claimant");
  const escrow = chain.escrow("payout", creator.address);
  await chain.fund(escrow.address);
  const payout = await completeBounty(escrow.contract, chain.config.provider, claimant.address, REWARD, escrow.issueHash, chain.config.oracleKeys.privateKey, null, BigInt(0));
  chain.record("payout", payout);
  await chain.assertOutput(payout.txid, claimant.address, REWARD);
  await chain.cleanup();
  expect(await chain.coins(claimant.address)).toHaveLength(0);
  expect(await chain.coins(escrow.address)).toHaveLength(0);
});

test("derives the same recovery keys from the public manifest and original funder", async () => {
  const creator = chain.wallet("recovery-creator");
  const escrow = chain.escrow("unfinished", creator.address);
  await chain.fund(escrow.address);
  const recovery = new ChainHarness(chain.manifestPath);
  recovery.config.provider = provider as unknown as ElectrumNetworkProvider;
  expect(recovery.wallet("recovery-creator").address).toBe(creator.address);
  expect(recovery.config.oracleKeys.publicKey).toEqual(chain.config.oracleKeys.publicKey);
  await recovery.cleanup();
  expect(await chain.coins(escrow.address)).toHaveLength(0);
  expect(await chain.coins(creator.address)).toHaveLength(0);
});

test("refunds two inputs with the dynamic fee and sweeps the result", async () => {
  const creator = chain.wallet("multi-refund-creator");
  const escrow = chain.escrow("multi-refund", creator.address);
  await chain.fund(escrow.address, BigInt(50_575));
  await chain.fund(escrow.address, BigInt(50_575));
  const refund = await refundBounty(escrow.contract, chain.config.provider, creator.address, escrow.issueHash, chain.config.oracleKeys.privateKey);
  chain.record("refund", refund.transaction);
  expect(refund.refundedAmount).toBe(REWARD);
  expect((await chain.outputs(refund.transaction.txid)).inputs).toHaveLength(2);
  await chain.cleanup();
});

test("rejects a real mainnet WIF before constructing any network provider", () => {
  vi.stubEnv("E2E_FUNDER_WIF", encodePrivateKeyWif(new Uint8Array(32).fill(2), "mainnet"));
  expect(() => new ChainHarness()).toThrow("Mainnet keys are never accepted");
});

test("does not retain a transaction the node explicitly rejects", async () => {
  const rejected = new Error("mandatory-script-verify-flag-failed");
  vi.spyOn(provider, "sendRawTransaction").mockRejectedValue(rejected);
  vi.spyOn(chain, "waitTransaction").mockRejectedValue(new Error("not found"));

  await expect(chain.broadcast("rejected", "00")).rejects.toThrow(rejected.message);
  const manifest = (chain as unknown as { manifest: { transactions: unknown[] } }).manifest;
  expect(manifest.transactions).toEqual([]);
});

test("retains signed bytes after a transport failure and an unsuccessful lookup", async () => {
  vi.spyOn(provider, "sendRawTransaction").mockRejectedValue(new ElectrumTransportError("TLS connection unavailable"));
  vi.spyOn(chain, "waitTransaction").mockRejectedValue(new Error("not found"));
  await expect(chain.broadcast("uncertain", "010203")).rejects.toThrow("signed transaction retained");
  const manifest = (chain as unknown as { manifest: { transactions: { hex: string }[] } }).manifest;
  expect(manifest.transactions).toEqual([expect.objectContaining({ hex: "010203" })]);
});

test("keeps already-known transactions and accepts a successful follow-up lookup", async () => {
  vi.spyOn(provider, "sendRawTransaction").mockRejectedValue(new Error("txn-already-known"));
  vi.spyOn(chain, "waitTransaction").mockResolvedValue("010203");
  await expect(chain.broadcast("already accepted", "010203")).resolves.toMatch(/^[0-9a-f]{64}$/);
  const manifest = (chain as unknown as { manifest: { transactions: unknown[] } }).manifest;
  expect(manifest.transactions).toHaveLength(1);
});

test("does not discard a possibly mined transaction when its inputs are reported as already spent", async () => {
  vi.spyOn(provider, "sendRawTransaction").mockRejectedValue(new Error("daemon error: bad-txns-inputs-missingorspent"));
  vi.spyOn(chain, "waitTransaction").mockRejectedValue(new Error("not found"));
  await expect(chain.broadcast("possibly mined", "010203")).rejects.toThrow("outcome unknown");
  const manifest = (chain as unknown as { manifest: { transactions: unknown[] } }).manifest;
  expect(manifest.transactions).toHaveLength(1);
});

test("recovers an actually accepted funding transaction after its reply and visibility were lost", async () => {
  const creator = chain.wallet("lost-reply-creator");
  const escrow = chain.escrow("lost-funding-reply", creator.address);
  const send = provider.sendRawTransaction.bind(provider);
  vi.spyOn(provider, "sendRawTransaction").mockImplementationOnce(async (hex) => {
    await send(hex); // The local BCH VM really accepts and spends the inputs.
    throw new ElectrumTransportError("Lost socket response");
  });
  const visibility = vi.spyOn(chain, "waitTransaction").mockRejectedValue(new Error("indexing unavailable"));
  await expect(chain.fund(escrow.address)).rejects.toThrow("signed transaction retained");
  visibility.mockRestore();
  await chain.cleanup(true);
  expect(await chain.coins(escrow.address)).toHaveLength(0);
  expect(await chain.coins(creator.address)).toHaveLength(0);
});

test("stops cleanup on exhausted connectivity instead of reporting every wallet as failed", async () => {
  const creator = chain.wallet("offline-creator");
  chain.wallet("another-unchecked-wallet");
  chain.escrow("offline-escrow", creator.address);
  chain.escrow("another-unchecked-escrow", creator.address);
  const coins = vi.spyOn(chain, "coins").mockRejectedValue(new ElectrumTransportError("Electrum unavailable"));
  await expect(chain.cleanup()).rejects.toThrow("remaining recovery checks were skipped");
  expect(coins).toHaveBeenCalledTimes(1);
  const manifest = (chain as unknown as { manifest: { escrows: unknown[]; recoveryErrors: string[] } }).manifest;
  expect(manifest.escrows).toHaveLength(2);
  expect(manifest.recoveryErrors).toHaveLength(2);
});
