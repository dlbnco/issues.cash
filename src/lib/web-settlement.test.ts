import { BountyStatus, type SettlementAttempt } from "@prisma/client";
import { prisma } from "./prisma";
import { completeBountyPayout, refundBountyToMaintainer } from "./bounty";
import { createConfig } from "./contract";
import { awardWebBounty, refundWebBounty, reconcileWebSettlements } from "./web-settlement";

jest.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: jest.fn(),
  bounty: { update: jest.fn() },
  claim: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  settlementAttempt: {
    create: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(), findMany: jest.fn(),
  },
} }));
jest.mock("./bounty", () => ({ completeBountyPayout: jest.fn(), refundBountyToMaintainer: jest.fn() }));
jest.mock("./contract", () => ({ createConfig: jest.fn() }));

const txId = "a".repeat(64);
const transaction = { txid: txId, hex: "010203" };
const bounty = { id: "bounty", status: BountyStatus.SETTLING, network: "MAINNET", webBounty: null };
const claim = { id: "claim", currentRevision: 2, revisions: [{ revision: 2, payoutAddress: "address" }] };
const attempt = {
  id: "attempt", bountyId: "bounty", claimId: "claim", intent: "PAYOUT",
  status: "PENDING", rawTx: null, txId: null, idempotencyKey: "v2-test",
} as SettlementAttempt;

beforeEach(() => {
  jest.resetAllMocks();
  // Exercise production control flow with mocked transaction delegates.
  jest.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) =>
    (callback as (tx: typeof prisma) => Promise<unknown>)(prisma));
  jest.mocked(prisma.bounty.update).mockResolvedValue(bounty as never);
  jest.mocked(prisma.claim.findFirst).mockResolvedValue(claim as never);
  jest.mocked(prisma.settlementAttempt.create).mockResolvedValue(attempt);
  jest.mocked(prisma.settlementAttempt.findUniqueOrThrow).mockResolvedValue(attempt);
});

it("requires the revision the creator actually reviewed", async () => {
  await expect(awardWebBounty("bounty", "claim", "creator", undefined as never)).rejects.toThrow("reviewed claim revision");
  expect(prisma.$transaction).not.toHaveBeenCalled();
  jest.mocked(prisma.claim.findFirst).mockResolvedValue(null);
  await expect(awardWebBounty("bounty", "claim", "creator", 1)).rejects.toThrow("Claim changed");
  expect(prisma.claim.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ currentRevision: 1, status: "PENDING" }),
  }));
  expect(completeBountyPayout).not.toHaveBeenCalled();
});

it("persists the signed transaction before finalizing a payout", async () => {
  jest.mocked(completeBountyPayout).mockImplementationOnce(async (_bounty, _address, _network, options) => {
    await options!.beforeBroadcast!(transaction);
    return { transaction } as never;
  });
  await expect(awardWebBounty("bounty", "claim", "creator", 2)).resolves.toEqual({ txId });
  expect(prisma.settlementAttempt.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
    where: { id: "attempt", status: "PENDING", rawTx: null },
    data: { status: "BROADCAST", rawTx: transaction.hex, txId },
  }));
  expect(prisma.claim.update).toHaveBeenCalledWith(expect.objectContaining({
    data: { status: "APPROVED", settlementTxId: txId },
  }));
});

it("allows refund with pending claims and rejects them on success", async () => {
  jest.mocked(prisma.settlementAttempt.create).mockResolvedValue({ ...attempt, intent: "REFUND", claimId: null });
  jest.mocked(refundBountyToMaintainer).mockImplementationOnce(async (_bounty, _network, options) => {
    await options!.beforeBroadcast!(transaction);
    return [transaction, BigInt(1000)];
  });
  await expect(refundWebBounty("bounty", "creator")).resolves.toEqual({ txId });
  expect(prisma.claim.updateMany).toHaveBeenCalledWith({
    where: { bountyId: "bounty", status: "PENDING" }, data: { status: "REJECTED" },
  });
});

it("never reopens an escrow after an ambiguous broadcast failure", async () => {
  jest.mocked(completeBountyPayout).mockRejectedValueOnce(new Error("Lost Electrum response"));
  jest.mocked(prisma.settlementAttempt.findUniqueOrThrow).mockResolvedValue({
    ...attempt, status: "BROADCAST", rawTx: transaction.hex, txId,
  });
  await expect(awardWebBounty("bounty", "claim", "creator", 2)).rejects.toThrow("being reconciled");
  expect(prisma.bounty.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ACTIVE" } }));
});

it("reopens an escrow only when nothing was persisted for broadcast", async () => {
  jest.mocked(completeBountyPayout).mockRejectedValueOnce(new Error("Contract has no funds"));
  await expect(awardWebBounty("bounty", "claim", "creator", 2)).rejects.toThrow("Contract has no funds");
  expect(prisma.settlementAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: "PENDING", rawTx: null, txId: null }),
    data: expect.objectContaining({ status: "FAILED" }),
  }));
  expect(prisma.bounty.update).toHaveBeenLastCalledWith({ where: { id: "bounty" }, data: { status: "ACTIVE" } });
});

it("reconciles a stopped worker before broadcasting and fences its attempt", async () => {
  jest.mocked(prisma.settlementAttempt.findMany).mockResolvedValue([{ ...attempt, bounty }] as never);
  await expect(reconcileWebSettlements()).resolves.toMatchObject({ reconciled: 1, errors: [] });
  expect(prisma.settlementAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ updatedAt: { lte: expect.any(Date) }, rawTx: null, status: "PENDING" }),
  }));
});

it("rebroadcasts only the saved transaction after a worker crash", async () => {
  const provider = { getRawTransaction: jest.fn().mockRejectedValue(new Error("Not found")), sendRawTransaction: jest.fn() };
  jest.mocked(createConfig).mockReturnValue({ provider } as never);
  jest.mocked(prisma.settlementAttempt.findMany).mockResolvedValue([{
    ...attempt, bounty, status: "BROADCAST", rawTx: transaction.hex, txId,
  }] as never);
  await expect(reconcileWebSettlements()).resolves.toMatchObject({ reconciled: 1, errors: [] });
  expect(provider.sendRawTransaction).toHaveBeenCalledWith(transaction.hex);
  expect(completeBountyPayout).not.toHaveBeenCalled();
});

it("keeps legacy ambiguous attempts reserved for manual inspection", async () => {
  jest.mocked(prisma.settlementAttempt.findMany).mockResolvedValue([{
    ...attempt, bounty, idempotencyKey: "award-legacy",
  }] as never);
  const result = await reconcileWebSettlements();
  expect(result.reconciled).toBe(0);
  expect(result.errors[0]).toContain("manual chain inspection");
  expect(prisma.bounty.update).not.toHaveBeenCalled();
});
