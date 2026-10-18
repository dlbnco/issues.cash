import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { CashAddressType, decodeCashAddress, encodeCashAddress, encodePrivateKeyWif } from "@bitauth/libauth";
import { MockNetworkProvider, type ElectrumNetworkProvider } from "cashscript";
import { ChainHarness, REWARD } from "./helpers/chain";
import { assertDisposableDatabase } from "./helpers/database";

// The app currently accepts ordinary P2PKH addresses, rather than their
// token-aware aliases. Both encode the same locking bytecode and signing key.
function ordinaryAddress(address: string) {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === "string") throw new Error("Invalid fixture address");
  return encodeCashAddress({ prefix: "bchtest", type: CashAddressType.p2pkh, payload: decoded.payload }).address;
}

const offline = process.env.E2E_OFFLINE === "1";

describe(`web bounty transactions and PostgreSQL (${offline ? "local BCH VM, no network" : "REAL Chipnet"})`, () => {
  let h: ChainHarness | undefined;
  let prisma: (typeof import("@/lib/prisma"))["prisma"] | undefined;
  let web: typeof import("@/lib/web-bounty");
  let bounties: typeof import("@/lib/bounty");
  let settlements: typeof import("@/lib/web-settlement");
  const bountyIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = assertDisposableDatabase(process.env.TEST_DATABASE_URL);
    if (offline) {
      vi.stubEnv("E2E_RUN_CHIPNET", "1");
      vi.stubEnv("E2E_FUNDER_WIF", encodePrivateKeyWif(crypto.randomBytes(32), "testnet"));
      vi.stubEnv("NEXT_PUBLIC_BCH_NETWORK", "testnet3");
      vi.stubEnv("BCH_ELECTRUM_HOST_TESTNET3", "chipnet.bch.ninja");
    }
    h = new ChainHarness();
    if (offline) {
      const provider = new MockNetworkProvider({ updateUtxoSet: true });
      provider.addUtxo(h.funder.address, { txid: "22".repeat(32), vout: 0, satoshis: BigInt(10_000_000) });
      h.config.provider = provider as unknown as ElectrumNetworkProvider;
      const contracts = await import("@/lib/contract");
      vi.spyOn(contracts, "createConfig").mockReturnValue(h.config);
      vi.spyOn(h, "medianTimePast").mockResolvedValue(Math.floor(Date.now() / 1000) - 7200);
    }
    await h.preflight();
    ({ prisma } = await import("@/lib/prisma"));
    if (await prisma.bounty.count() !== 0) throw new Error("Chain scenarios require an EMPTY disposable bounty database; refusing to process other escrows.");
    web = await import("@/lib/web-bounty");
    bounties = await import("@/lib/bounty");
    settlements = await import("@/lib/web-settlement");
    process.env.COMMISSION_BPS = "0";
    process.env.ZERO_COMMISSION_PROJECTS = "";
  });
  afterEach(async () => {
    process.env.COMMISSION_BPS = "0";
    // Keep the rows/manifest if chain recovery fails; never silently delete the
    // only escrow metadata while a transaction might still be pending.
    await h?.cleanup();
    if (prisma) {
      await prisma.bounty.deleteMany({ where: { id: { in: bountyIds.splice(0) } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    }
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function fixture(label: string) {
    const creatorWallet = h!.wallet(`${label}-creator`);
    const claimantWallet = h!.wallet(`${label}-claimant`);
    const refundAddress = ordinaryAddress(creatorWallet.address);
    const payoutAddress = ordinaryAddress(claimantWallet.address);
    const users = [];
    for (const firstName of ["Creator", "Claimant"]) {
      const user = await prisma!.user.create({ data: {
        telegramId: BigInt(`0x${crypto.randomBytes(6).toString("hex")}`), firstName,
      } });
      users.push(user);
      userIds.push(user.id);
    }
    const [creator, claimant] = users;
    const bounty = await web.createWebBounty({
      creatorId: creator.id, title: `Chipnet E2E ${label}`, amountBCH: 0.001,
      refundAddress, expiryDays: 1, network: "TESTNET3",
      body: { root: { type: "root", version: 1, children: [{ type: "paragraph", children: [{ type: "text", text: label }] }] } },
    });
    bountyIds.push(bounty.id);
    h!.trackEscrow({ ...bounty, address: bounty.contractAddress });
    return { bounty, creator, claimant, refundAddress, payoutAddress };
  }

  async function activate(bounty: { id: string; contractAddress: string }) {
    await h!.fund(bounty.contractAddress);
    const result = await bounties.checkPendingBounties();
    expect(result.funded).toBe(1);
    const active = await prisma!.bounty.findUniqueOrThrow({ where: { id: bounty.id } });
    expect(active.status).toBe("ACTIVE");
    return active;
  }

  async function recordSettlement(bountyId: string, status: string) {
    const bounty = await prisma!.bounty.findUniqueOrThrow({ where: { id: bountyId } });
    expect(bounty.status).toBe(status);
    const attempt = await prisma!.settlementAttempt.findFirstOrThrow({ where: { bountyId } });
    expect(attempt.status).toBe("CONFIRMED");
    expect(attempt.txId).toBe(bounty.settlementTxId);
    expect(attempt.rawTx).toBeTruthy();
    h!.record(`web ${status.toLowerCase()}`, { txid: attempt.txId!, hex: attempt.rawTx! });
    await h!.waitTransaction(attempt.txId!);
    return attempt.txId!;
  }

  test("funds, approves the reviewed claim, and pays the contributor plus commission", async () => {
    process.env.COMMISSION_BPS = "200";
    const f = await fixture("award");
    await activate(f.bounty);
    const claim = await web.createOrUpdateClaim(f.bounty.id, f.claimant.id, { payoutAddress: f.payoutAddress, body: "Delivered" });
    await web.awardWebBounty(f.bounty.id, claim.id, f.creator.id, 1);
    const txId = await recordSettlement(f.bounty.id, "CLAIMED");
    await h!.assertOutput(txId, f.payoutAddress, BigInt(98_000));
    await h!.assertOutput(txId, h!.config.oracleKeys.address, BigInt(2_000));
    expect((await h!.outputs(txId)).outputs).toHaveLength(2);
    expect((await prisma!.claim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe("APPROVED");
  });

  test("refunds despite a pending claim and rejects it", async () => {
    const f = await fixture("refund");
    await activate(f.bounty);
    const claim = await web.createOrUpdateClaim(f.bounty.id, f.claimant.id, { payoutAddress: f.payoutAddress, body: "Pending delivery" });
    await web.refundWebBounty(f.bounty.id, f.creator.id);
    const txId = await recordSettlement(f.bounty.id, "REFUNDED");
    await h!.assertOutput(txId, f.refundAddress, REWARD);
    expect((await prisma!.claim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe("REJECTED");
  });

  test("cancels a partially funded escrow and the funding cron refunds its actual balance", async () => {
    const f = await fixture("cancel-partial");
    await h!.fund(f.bounty.contractAddress, BigInt(50_000));
    await web.cancelWebBounty(f.bounty.id, f.creator.id);
    await bounties.checkPendingBounties();
    const txId = await recordSettlement(f.bounty.id, "REFUNDED");
    await h!.assertOutput(txId, f.refundAddress, BigInt(49_000));
    expect((await prisma!.webBounty.findUniqueOrThrow({ where: { bountyId: f.bounty.id } })).cancelledAt).not.toBeNull();
  });

  test("expiry processing spends the actual timeout path and closes outstanding claims", async () => {
    const f = await fixture("expiry");
    // Bypass the public one-day minimum ONLY in this fixture: both stored and
    // on-chain parameters use a time below the current chain median.
    const expired = h!.escrow("web-expiry", f.refundAddress, (await h!.medianTimePast()) - 1);
    const bounty = await prisma!.bounty.update({ where: { id: f.bounty.id }, data: {
      contractAddress: expired.address, issueHash: expired.issueHash, locktime: expired.locktime,
      oraclePubkey: expired.oraclePubkey, maintainerPKH: expired.maintainerPKH,
    } });
    await activate(bounty);
    const claim = await web.createOrUpdateClaim(bounty.id, f.claimant.id, { payoutAddress: f.payoutAddress, body: "Pending" });
    const result = await bounties.processExpiredBounties();
    expect(result.errors).toEqual([]);
    expect(result.refunded).toBe(1);
    const txId = await recordSettlement(bounty.id, "EXPIRED");
    await h!.assertOutput(txId, f.refundAddress, REWARD);
    expect((await prisma!.claim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe("REJECTED");
  });

  test("a stale claim revision cannot spend the escrow", async () => {
    const f = await fixture("revision");
    await activate(f.bounty);
    const claim = await web.createOrUpdateClaim(f.bounty.id, f.claimant.id, { payoutAddress: f.payoutAddress, body: "Original" });
    await web.createOrUpdateClaim(f.bounty.id, f.claimant.id, { payoutAddress: f.payoutAddress, body: "Revised" });
    await expect(web.awardWebBounty(f.bounty.id, claim.id, f.creator.id, 1)).rejects.toThrow("Claim changed");
    expect(await prisma!.settlementAttempt.count({ where: { bountyId: f.bounty.id } })).toBe(0);
    expect((await h!.coins(f.bounty.contractAddress)).length).toBeGreaterThan(0);
    await web.awardWebBounty(f.bounty.id, claim.id, f.creator.id, 2);
    await h!.assertOutput(await recordSettlement(f.bounty.id, "CLAIMED"), f.payoutAddress, REWARD);
  });

  test("reconciles a broadcast whose successful response was lost, without a second spend", async () => {
    const f = await fixture("lost-response");
    await activate(f.bounty);
    const claim = await web.createOrUpdateClaim(f.bounty.id, f.claimant.id, { payoutAddress: f.payoutAddress, body: "Delivered" });
    const prototype = Object.getPrototypeOf(h!.config.provider) as ElectrumNetworkProvider;
    const original = prototype.sendRawTransaction;
    const transport = vi.spyOn(prototype, "sendRawTransaction").mockImplementationOnce(async function (this: ElectrumNetworkProvider, hex) {
      const txId = await original.call(this, hex); // real Chipnet in live mode; BCH VM in offline mode
      await h!.waitTransaction(txId);
      throw new Error("Injected loss of a successful broadcast response");
    });
    try {
      await expect(web.awardWebBounty(f.bounty.id, claim.id, f.creator.id, 1)).rejects.toThrow("being reconciled");
      const attempt = await prisma!.settlementAttempt.findFirstOrThrow({ where: { bountyId: f.bounty.id } });
      expect(attempt.status).toBe("BROADCAST");
      expect((await prisma!.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } })).status).toBe("SETTLING");
      h!.record("lost-response payout", { txid: attempt.txId!, hex: attempt.rawTx! });
      await prisma!.settlementAttempt.update({ where: { id: attempt.id }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
      const result = await settlements.reconcileWebSettlements();
      expect(result.errors).toEqual([]);
      expect(result.reconciled).toBe(1);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await recordSettlement(f.bounty.id, "CLAIMED")).toBe(attempt.txId);
      await h!.assertOutput(attempt.txId!, f.payoutAddress, REWARD);
    } finally { transport.mockRestore(); }
  });
});
