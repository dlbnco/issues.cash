// Run against a disposable, migrated database with TEST_DATABASE_URL set.
import crypto from "crypto";
import { BountyStatus, ClaimStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cancelWebBounty, createOrUpdateClaim } from "./web-bounty";
import { awardWebBounty, refundWebBounty, refundCancelledWebBounty, reconcileWebSettlements, timeoutWebBounty } from "./web-settlement";
import { completeBountyPayout, refundBountyToMaintainer, timeoutBountyRefund } from "./bounty";
import { createConfig } from "./contract";
import { checkRateLimit } from "./rate-limit";
import { getAllBounties } from "./queries";

jest.mock("@/lib/prisma", () => {
  const { PrismaClient } = jest.requireActual("@prisma/client");
  return { prisma: new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://localhost/unused" }) };
});
jest.mock("./commands", () => ({ validateAddressForNetwork: () => ({ valid: true }) }));
jest.mock("./bounty", () => ({ completeBountyPayout: jest.fn(), refundBountyToMaintainer: jest.fn(), timeoutBountyRefund: jest.fn() }));
jest.mock("./contract", () => ({ createConfig: jest.fn() }));

const describeDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const transaction = { txid: "a".repeat(64), hex: "010203" };

describeDatabase("web bounties with PostgreSQL", () => {
  let creatorId: string;
  let claimantId: string;
  let bountyId: string;
  let claimId: string;
  const rateKeys: string[] = [];

  beforeEach(async () => {
    jest.resetAllMocks();
    const creator = await prisma.user.create({ data: { telegramId: BigInt(`0x${crypto.randomBytes(6).toString("hex")}`), firstName: "Creator" } });
    const claimant = await prisma.user.create({ data: { telegramId: BigInt(`0x${crypto.randomBytes(6).toString("hex")}`), firstName: "Claimant" } });
    creatorId = creator.id;
    claimantId = claimant.id;
    const bounty = await prisma.bounty.create({ data: {
      network: "MAINNET", platform: "WEB", contractAddress: crypto.randomUUID(),
      maintainerAddress: "refund", maintainerPKH: "00", issueHash: "00", oraclePubkey: "00",
      locktime: Math.floor(Date.now() / 1000) + 86400, status: "ACTIVE", amount: BigInt(100000),
      webBounty: { create: { creatorId, slug: crypto.randomUUID(), title: "Test", body: { root: {} } } },
    } });
    bountyId = bounty.id;
    const claim = await prisma.claim.create({ data: {
      bountyId, claimantId, revisions: { create: { revision: 1, payoutAddress: "original", body: "Original work" } },
    } });
    claimId = claim.id;
    jest.mocked(completeBountyPayout).mockImplementation(async (_bounty, _address, _network, options) => {
      await options!.beforeBroadcast!(transaction);
      return { transaction } as never;
    });
    jest.mocked(refundBountyToMaintainer).mockImplementation(async (_bounty, _network, options) => {
      await options!.beforeBroadcast!(transaction);
      return [transaction, BigInt(1000)];
    });
    jest.mocked(timeoutBountyRefund).mockImplementation(jest.mocked(refundBountyToMaintainer));
  });

  afterEach(async () => {
    await prisma.bounty.delete({ where: { id: bountyId } });
    await prisma.user.deleteMany({ where: { id: { in: [creatorId, claimantId] } } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: rateKeys.splice(0) } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("refunds despite pending claims and closes them atomically", async () => {
    await refundWebBounty(bountyId, creatorId);
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe("REFUNDED");
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).status).toBe("REJECTED");
  });

  it("rejects an outdated reviewed revision without reserving or paying the bounty", async () => {
    await createOrUpdateClaim(bountyId, claimantId, { payoutAddress: "changed", body: "Changed work" });
    await expect(awardWebBounty(bountyId, claimId, creatorId, 1)).rejects.toThrow("Claim changed");
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe("ACTIVE");
    expect(await prisma.settlementAttempt.count({ where: { bountyId } })).toBe(0);
    expect(completeBountyPayout).not.toHaveBeenCalled();
  });

  it("allows only one competing award/refund reservation to broadcast", async () => {
    const results = await Promise.allSettled([
      awardWebBounty(bountyId, claimId, creatorId, 1), refundWebBounty(bountyId, creatorId),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(jest.mocked(completeBountyPayout).mock.calls.length + jest.mocked(refundBountyToMaintainer).mock.calls.length).toBe(1);
    expect(await prisma.settlementAttempt.count({ where: { bountyId } })).toBe(1);
  });

  it("does not let non-creators reserve an award or a refund", async () => {
    await expect(awardWebBounty(bountyId, claimId, claimantId, 1)).rejects.toThrow();
    await expect(refundWebBounty(bountyId, claimantId)).rejects.toThrow();
    expect(await prisma.settlementAttempt.count({ where: { bountyId } })).toBe(0);
  });

  it("archives cancelled escrows, keeps contract data, and can refund partial deposits", async () => {
    await prisma.bounty.update({ where: { id: bountyId }, data: { status: "PENDING_FUNDING" } });
    await cancelWebBounty(bountyId, creatorId);
    const cancelled = await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId }, include: { webBounty: true } });
    expect(cancelled.webBounty!.cancelledAt).not.toBeNull();
    expect(cancelled.issueHash).toBe("00");
    expect(cancelled.contractAddress).toBeTruthy();
    expect((await getAllBounties()).some((bounty) => bounty.id === bountyId)).toBe(false);
    await refundCancelledWebBounty(bountyId);
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe("REFUNDED");
  });

  it("cannot cancel an active escrow", async () => {
    await expect(cancelWebBounty(bountyId, creatorId)).rejects.toThrow();
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe("ACTIVE");
  });

  it("records expiry through the same settlement lock and rejects outstanding claims", async () => {
    await expect(timeoutWebBounty(bountyId)).rejects.toThrow();
    await prisma.bounty.update({ where: { id: bountyId }, data: { locktime: Math.floor(Date.now() / 1000) - 1 } });
    await timeoutWebBounty(bountyId);
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe("EXPIRED");
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).status).toBe("REJECTED");
  });

  it("rebroadcasts the saved spend and finalizes after a lost network response", async () => {
    jest.mocked(completeBountyPayout).mockImplementationOnce(async (_bounty, _address, _network, options) => {
      await options!.beforeBroadcast!(transaction);
      throw new Error("Network response lost");
    });
    await expect(awardWebBounty(bountyId, claimId, creatorId, 1)).rejects.toThrow("being reconciled");
    await expect(createOrUpdateClaim(bountyId, claimantId, { payoutAddress: "new", body: "new" })).rejects.toThrow();
    await prisma.settlementAttempt.updateMany({ where: { bountyId }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
    const provider = { getRawTransaction: jest.fn().mockRejectedValue(new Error("Not found")), sendRawTransaction: jest.fn() };
    jest.mocked(createConfig).mockReturnValue({ provider } as never);
    const result = await reconcileWebSettlements();
    expect(result.errors).toEqual([]);
    expect(provider.sendRawTransaction).toHaveBeenCalledWith(transaction.hex);
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe(BountyStatus.CLAIMED);
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).status).toBe(ClaimStatus.APPROVED);
  });

  it("fences a paused worker after its unbroadcast reservation is reclaimed", async () => {
    let resume!: () => void;
    let reserved!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const ready = new Promise<void>((resolve) => { reserved = resolve; });
    const sent = jest.fn();
    jest.mocked(completeBountyPayout).mockImplementationOnce(async (_bounty, _address, _network, options) => {
      reserved();
      await paused;
      await options!.beforeBroadcast!(transaction);
      sent();
      return { transaction } as never;
    });
    const payout = awardWebBounty(bountyId, claimId, creatorId, 1);
    const failure = expect(payout).rejects.toThrow();
    await ready;
    await prisma.settlementAttempt.updateMany({ where: { bountyId }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
    expect((await reconcileWebSettlements()).reconciled).toBe(1);
    resume();
    await failure;
    expect(sent).not.toHaveBeenCalled();
    expect((await prisma.bounty.findUniqueOrThrow({ where: { id: bountyId } })).status).toBe("ACTIVE");
  });

  it("enforces a single rate limit under concurrent requests and resets expired windows", async () => {
    const key = crypto.randomUUID();
    rateKeys.push(key);
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit(key, 3, 60_000)));
    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    await prisma.rateLimitBucket.update({ where: { key }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(checkRateLimit(key, 3, 60_000)).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
  });
});
