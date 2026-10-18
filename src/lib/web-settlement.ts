import crypto from "crypto";
import { BountyStatus, ClaimStatus, Platform, type SettlementAttempt, type SettlementIntent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createConfig, type TransactionResult } from "@/lib/contract";
import { fromPrismaToElectrumNetwork } from "@/lib/network";

const STALE_AFTER_MS = 10 * 60_000;

async function finalizeSettlement(attempt: SettlementAttempt, txId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.bounty.update({
      where: { id: attempt.bountyId, status: BountyStatus.SETTLING },
      data: {
        status: attempt.intent === "PAYOUT" ? BountyStatus.CLAIMED
          : attempt.intent === "TIMEOUT" ? BountyStatus.EXPIRED : BountyStatus.REFUNDED,
        settlementTxId: txId,
      },
    });
    if (attempt.intent === "PAYOUT" && attempt.claimId) {
      await tx.claim.update({
        where: { id: attempt.claimId },
        data: { status: ClaimStatus.APPROVED, settlementTxId: txId },
      });
    }
    await tx.claim.updateMany({
      where: { bountyId: attempt.bountyId, status: ClaimStatus.PENDING },
      data: { status: ClaimStatus.REJECTED },
    });
    await tx.settlementAttempt.update({
      where: { id: attempt.id, status: { in: ["PENDING", "BROADCAST"] } },
      data: { status: "CONFIRMED", txId, error: null },
    });
  });
}

async function releaseUnbroadcastSettlement(attempt: SettlementAttempt, error: string, staleBefore?: Date) {
  await prisma.$transaction(async (tx) => {
    const bounty = await tx.bounty.update({
      where: { id: attempt.bountyId, status: BountyStatus.SETTLING },
      data: { updatedAt: new Date() },
      include: { webBounty: true },
    });
    // This conditional also fences out a paused worker: its beforeBroadcast
    // callback cannot persist (and therefore cannot send) a FAILED attempt.
    await tx.settlementAttempt.update({
      where: {
        id: attempt.id, status: "PENDING", rawTx: null, txId: null,
        ...(staleBefore ? { updatedAt: { lte: staleBefore } } : {}),
      },
      data: { status: "FAILED", error },
    });
    await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: bounty.webBounty?.cancelledAt ? BountyStatus.PENDING_FUNDING : BountyStatus.ACTIVE },
    });
  });
}

async function settleWebBounty(
  bountyId: string,
  intent: SettlementIntent,
  options: { creatorId?: string; claimId?: string; revision?: number; cancelled?: boolean },
): Promise<{ txId: string }> {
  if (intent === "PAYOUT" && (!Number.isInteger(options.revision) || options.revision! < 1)) {
    throw new Error("The reviewed claim revision is required");
  }
  const { bounty, claim, attempt } = await prisma.$transaction(async (tx) => {
    const bounty = await tx.bounty.update({
      where: {
        id: bountyId, platform: Platform.WEB,
        status: options.cancelled ? BountyStatus.PENDING_FUNDING : BountyStatus.ACTIVE,
        webBounty: {
          ...(options.creatorId ? { creatorId: options.creatorId } : {}),
          cancelledAt: options.cancelled ? { not: null } : null,
        },
        ...(intent === "TIMEOUT" ? { locktime: { lte: Math.floor(Date.now() / 1000) } } : {}),
      },
      data: { status: BountyStatus.SETTLING },
    });
    const claim = intent === "PAYOUT" ? await tx.claim.findFirst({
      where: { id: options.claimId, bountyId, status: ClaimStatus.PENDING, currentRevision: options.revision },
      include: { revisions: { where: { revision: options.revision }, take: 1 } },
    }) : null;
    if (intent === "PAYOUT" && !claim?.revisions[0]) {
      throw new Error("Claim changed or is no longer pending. Refresh and review it again before awarding.");
    }
    const attempt = await tx.settlementAttempt.create({
      data: {
        idempotencyKey: `v2-${crypto.randomUUID()}`, intent, bountyId,
        claimId: claim?.id,
      },
    });
    return { bounty, claim, attempt };
  });

  const beforeBroadcast = async (transaction: TransactionResult) => {
    await prisma.$transaction(async (tx) => {
      await tx.bounty.update({
        where: { id: bountyId, status: BountyStatus.SETTLING },
        data: { updatedAt: new Date() },
      });
      await tx.settlementAttempt.update({
        where: { id: attempt.id, status: "PENDING", rawTx: null },
        data: { status: "BROADCAST", txId: transaction.txid, rawTx: transaction.hex },
      });
    });
  };

  try {
    const { completeBountyPayout, refundBountyToMaintainer, timeoutBountyRefund } = await import("@/lib/bounty");
    const network = fromPrismaToElectrumNetwork(bounty.network);
    const settlementOptions = { updateStatus: false, beforeBroadcast };
    const transaction = claim
      ? (await completeBountyPayout(bounty, claim.revisions[0].payoutAddress, network, settlementOptions)).transaction
      : intent === "TIMEOUT"
        ? (await timeoutBountyRefund(bounty, network, settlementOptions))[0]
        : (await refundBountyToMaintainer(bounty, network, settlementOptions))[0];
    await finalizeSettlement(attempt, transaction.txid);
    return { txId: transaction.txid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settlement failed";
    // A lost broadcast response is not proof that broadcasting failed. Only
    // release an attempt if the durable pre-broadcast write never happened.
    const stored = await prisma.settlementAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    if (!stored.rawTx && !stored.txId && stored.status === "PENDING") {
      await releaseUnbroadcastSettlement(stored, message);
      throw error;
    }
    await prisma.settlementAttempt.updateMany({
      where: { id: attempt.id, status: { in: ["PENDING", "BROADCAST"] } },
      data: { error: message },
    });
    throw new Error("Settlement is being reconciled. Do not submit another payout or refund.");
  }
}

export function awardWebBounty(bountyId: string, claimId: string, creatorId: string, revision: number) {
  return settleWebBounty(bountyId, "PAYOUT", { creatorId, claimId, revision });
}

export function refundWebBounty(bountyId: string, creatorId: string) {
  // Pending claims cannot lock up an escrow. A successful refund rejects them.
  return settleWebBounty(bountyId, "REFUND", { creatorId });
}

export function refundCancelledWebBounty(bountyId: string) {
  return settleWebBounty(bountyId, "REFUND", { cancelled: true });
}

export function timeoutWebBounty(bountyId: string) {
  return settleWebBounty(bountyId, "TIMEOUT", {});
}

export async function reconcileWebSettlements() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  const attempts = await prisma.settlementAttempt.findMany({
    where: {
      status: { in: ["PENDING", "BROADCAST"] }, updatedAt: { lte: staleBefore },
      bounty: { platform: Platform.WEB, status: BountyStatus.SETTLING },
    },
    include: { bounty: true },
  });
  const errors: string[] = [];
  let reconciled = 0;
  for (const attempt of attempts) {
    try {
      if (!attempt.txId && !attempt.rawTx) {
        if (!attempt.idempotencyKey.startsWith("v2-")) {
          throw new Error("Legacy attempt has no durable transaction; manual chain inspection is required");
        }
        await releaseUnbroadcastSettlement(attempt, "Worker stopped before broadcast", staleBefore);
      } else {
        const network = fromPrismaToElectrumNetwork(attempt.bounty.network);
        const { provider } = createConfig(network, "./contracts/DynamicBounty.cash", `./oracle-key-${network}.json`);
        if (!attempt.txId) throw new Error("Settlement transaction ID is missing");
        try {
          await provider.getRawTransaction(attempt.txId);
        } catch {
          if (!attempt.rawTx) throw new Error("Transaction is not visible yet; leaving escrow reserved");
          // Re-send the SAME signed transaction, never build a different spend.
          await provider.sendRawTransaction(attempt.rawTx);
        }
        await finalizeSettlement(attempt, attempt.txId);
      }
      reconciled++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reconciliation failed";
      errors.push(`Settlement ${attempt.id}: ${message}`);
      await prisma.settlementAttempt.updateMany({
        where: { id: attempt.id, status: { in: ["PENDING", "BROADCAST"] } },
        data: { error: message },
      });
    }
  }
  return { checked: attempts.length, reconciled, errors };
}
