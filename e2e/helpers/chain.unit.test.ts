import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { encodePrivateKeyWif } from "@bitauth/libauth";
import { MockNetworkProvider, type ElectrumNetworkProvider } from "cashscript";
import { completeBounty, refundBounty } from "@/lib/contract";
import { ChainHarness, REWARD } from "./chain";

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
