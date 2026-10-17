import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { BCHNetwork, BountyStatus, ClaimStatus, Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bchToSats, validateAddressForNetwork, validateBountyAmount } from "@/lib/commands";
import { UNLOCKING_TX_FEE_AMOUNT } from "@/lib/constants";
import { createBounty, createConfig } from "@/lib/contract";
import { fromPrismaToElectrumNetwork } from "@/lib/network";

const MAX_TITLE_LENGTH = 160;
const MAX_BODY_BYTES = 50_000;
const MAX_CLAIM_BODY_LENGTH = 10_000;

function assertBody(body: unknown): asserts body is Prisma.InputJsonValue {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Bounty description is required");
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) {
    throw new Error("Bounty description is too large");
  }
}

function assertTitle(title: string): void {
  if (!title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
  }
}

function assertExpiryDays(expiryDays: number): void {
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365) {
    throw new Error("Expiry must be between 1 and 365 days");
  }
}

function createSlug(title: string, id: string): string {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72) || "bounty";
  return `${words}-${id.slice(0, 8)}`;
}

function networkName(network: BCHNetwork): "mainnet" | "testnet3" {
  return fromPrismaToElectrumNetwork(network) as "mainnet" | "testnet3";
}

export interface CreateWebBountyInput {
  creatorId: string;
  title: string;
  body: unknown;
  amountBCH: number;
  refundAddress: string;
  expiryDays: number;
  network: BCHNetwork;
}

export async function createWebBounty(input: CreateWebBountyInput) {
  assertTitle(input.title);
  assertBody(input.body);
  assertExpiryDays(input.expiryDays);
  const network = networkName(input.network);
  const amountValidation = validateBountyAmount(input.amountBCH, network);
  if (!amountValidation.valid) throw new Error(amountValidation.error);
  const addressValidation = validateAddressForNetwork(input.refundAddress, network);
  if (!addressValidation.valid) throw new Error(addressValidation.error);

  const id = crypto.randomUUID();
  const config = createConfig(
    network,
    "./contracts/DynamicBounty.cash",
    `./oracle-key-${network}.json`,
  );
  const contract = createBounty(config, `web:${id}`, input.refundAddress, input.expiryDays);
  const title = input.title.trim();
  const amount = BigInt(bchToSats(input.amountBCH));

  return prisma.bounty.create({
    data: {
      id,
      network: input.network,
      platform: Platform.WEB,
      issueHash: contract.issueHash,
      contractAddress: contract.address,
      maintainerAddress: contract.maintainerAddress,
      maintainerPKH: contract.maintainerPKH,
      locktime: contract.locktime,
      oraclePubkey: contract.oraclePubkey,
      amount,
      feeAmount: UNLOCKING_TX_FEE_AMOUNT,
      webBounty: {
        create: {
          slug: createSlug(title, id),
          title,
          body: input.body,
          creatorId: input.creatorId,
          revisions: { create: { revision: 1, title, body: input.body } },
        },
      },
    },
    include: { webBounty: true },
  });
}

export async function updateWebBounty(
  bountyId: string,
  creatorId: string,
  input: Pick<CreateWebBountyInput, "title" | "body">,
) {
  assertTitle(input.title);
  assertBody(input.body);
  const bounty = await prisma.bounty.findFirst({
    where: { id: bountyId, platform: Platform.WEB, webBounty: { creatorId } },
    include: { webBounty: true },
  });
  if (!bounty?.webBounty) throw new Error("Bounty not found");
  if (bounty.status === BountyStatus.CLAIMED || bounty.status === BountyStatus.REFUNDED || bounty.status === BountyStatus.EXPIRED) {
    throw new Error("Closed bounties cannot be edited");
  }
  if (bounty.status === BountyStatus.SETTLING) throw new Error("Bounty is being settled");

  const title = input.title.trim();
  const revision = bounty.webBounty.revision + 1;
  return prisma.webBounty.update({
    where: { bountyId },
    data: {
      title,
      body: input.body,
      revision,
      revisions: { create: { revision, title, body: input.body } },
    },
  });
}

export async function cancelWebBounty(bountyId: string, creatorId: string): Promise<void> {
  const bounty = await prisma.bounty.findFirst({
    where: { id: bountyId, platform: Platform.WEB, webBounty: { creatorId } },
  });
  if (!bounty) throw new Error("Bounty not found");
  if (bounty.status !== BountyStatus.PENDING_FUNDING) {
    throw new Error("Only unfunded bounties can be cancelled");
  }
  await prisma.bounty.delete({ where: { id: bounty.id } });
}

export interface ClaimInput {
  payoutAddress: string;
  body: string;
  workUrl?: string;
}

function validateClaim(input: ClaimInput, network: BCHNetwork): void {
  if (!input.body.trim() || input.body.length > MAX_CLAIM_BODY_LENGTH) {
    throw new Error(`Claim details must be between 1 and ${MAX_CLAIM_BODY_LENGTH} characters`);
  }
  const addressValidation = validateAddressForNetwork(input.payoutAddress, networkName(network));
  if (!addressValidation.valid) throw new Error(addressValidation.error);
  if (input.workUrl) {
    try {
      const url = new URL(input.workUrl);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("Work URL must be a valid HTTPS URL");
    }
  }
}

export async function createOrUpdateClaim(bountyId: string, claimantId: string, input: ClaimInput) {
  const bounty = await prisma.bounty.findFirst({
    where: { id: bountyId, platform: Platform.WEB },
  });
  if (!bounty) throw new Error("Bounty not found");
  if (bounty.status !== BountyStatus.ACTIVE) throw new Error("This bounty is not accepting claims");
  validateClaim(input, bounty.network);

  const existing = await prisma.claim.findUnique({
    where: { bountyId_claimantId: { bountyId, claimantId } },
  });
  if (!existing) {
    return prisma.claim.create({
      data: {
        bountyId,
        claimantId,
        revisions: { create: { revision: 1, ...input } },
      },
      include: { revisions: true },
    });
  }
  if (existing.status !== ClaimStatus.PENDING) throw new Error("This claim can no longer be edited");
  const revision = existing.currentRevision + 1;
  return prisma.claim.update({
    where: { id: existing.id },
    data: {
      currentRevision: revision,
      revisions: { create: { revision, ...input } },
    },
    include: { revisions: true },
  });
}

export async function withdrawClaim(bountyId: string, claimantId: string): Promise<void> {
  const claim = await prisma.claim.findUnique({ where: { bountyId_claimantId: { bountyId, claimantId } } });
  if (!claim) throw new Error("Claim not found");
  if (claim.status !== ClaimStatus.PENDING) throw new Error("This claim can no longer be withdrawn");
  await prisma.claim.update({ where: { id: claim.id }, data: { status: ClaimStatus.WITHDRAWN } });
}

export async function awardWebBounty(
  bountyId: string,
  claimId: string,
  creatorId: string,
): Promise<{ txId: string }> {
  const bounty = await prisma.bounty.findFirst({
    where: { id: bountyId, platform: Platform.WEB, webBounty: { creatorId } },
  });
  if (!bounty) throw new Error("Bounty not found or you are not the creator");
  if (bounty.status !== BountyStatus.ACTIVE) {
    throw new Error("Bounty is not in a claimable state");
  }

  const claim = await prisma.claim.findFirst({
    where: { id: claimId, bountyId, status: ClaimStatus.PENDING },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
  if (!claim || !claim.revisions[0]) {
    throw new Error("Claim not found or not pending");
  }

  const idempotencyKey = `award-${bountyId}-${claimId}-${Date.now()}`;

  // Atomically reserve bounty → SETTLING and record the settlement attempt
  const [, settlementAttempt] = await prisma.$transaction([
    prisma.bounty.update({
      where: { id: bountyId, status: BountyStatus.ACTIVE },
      data: { status: BountyStatus.SETTLING },
    }),
    prisma.settlementAttempt.create({
      data: {
        idempotencyKey,
        intent: "PAYOUT",
        bountyId,
        claimId,
      },
    }),
  ]);

  let txId: string | undefined;
  try {
    const network = fromPrismaToElectrumNetwork(bounty.network);
    const { completeBountyPayout } = await import("@/lib/bounty");

    const result = await completeBountyPayout(
      { ...bounty, status: BountyStatus.SETTLING },
      claim.revisions[0].payoutAddress,
      network,
      { updateStatus: false },
    );
    txId = result.transaction.txid;

    // Update claim → APPROVED, close all other pending claims
    await prisma.$transaction([
      prisma.bounty.update({
        where: { id: bountyId, status: BountyStatus.SETTLING },
        data: { status: BountyStatus.CLAIMED, settlementTxId: txId },
      }),
      prisma.claim.update({
        where: { id: claimId },
        data: { status: ClaimStatus.APPROVED, settlementTxId: txId },
      }),
      prisma.claim.updateMany({
        where: { bountyId, id: { not: claimId }, status: ClaimStatus.PENDING },
        data: { status: ClaimStatus.REJECTED },
      }),
      prisma.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: { status: "CONFIRMED", txId },
      }),
    ]);

    console.log(`✅ Web bounty ${bountyId} awarded to claim ${claimId}, TX: ${txId}`);
    return { txId };
  } catch (error) {
    if (txId) {
      await prisma.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: {
          status: "BROADCAST",
          txId,
          error: error instanceof Error ? error.message : "Settlement reconciliation required",
        },
      }).catch(() => undefined);
      throw new Error("Payout was broadcast but could not be finalized. Reconciliation is required.");
    }

    await prisma.$transaction([
      prisma.bounty.update({
        where: { id: bountyId, status: BountyStatus.SETTLING },
        data: { status: BountyStatus.ACTIVE },
      }),
      prisma.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }),
    ]);
    throw error;
  }
}

export async function refundWebBounty(bountyId: string, creatorId: string): Promise<{ txId: string }> {
  const bounty = await prisma.bounty.findFirst({
    where: { id: bountyId, platform: Platform.WEB, webBounty: { creatorId } },
  });
  if (!bounty) throw new Error("Bounty not found or you are not the creator");
  if (bounty.status !== BountyStatus.ACTIVE) {
    throw new Error("Only active bounties can be refunded");
  }

  // Only allow refund if there are no pending claims
  const pendingClaims = await prisma.claim.count({
    where: { bountyId, status: ClaimStatus.PENDING },
  });
  if (pendingClaims > 0) {
    throw new Error("Cannot refund: there are pending claims. Wait for them to expire or withdraw.");
  }

  const idempotencyKey = `refund-${bountyId}-${Date.now()}`;

  const [, settlementAttempt] = await prisma.$transaction([
    prisma.bounty.update({
      where: { id: bountyId, status: BountyStatus.ACTIVE },
      data: { status: BountyStatus.SETTLING },
    }),
    prisma.settlementAttempt.create({
      data: {
        idempotencyKey,
        intent: "REFUND",
        bountyId,
      },
    }),
  ]);

  let txId: string | undefined;
  try {
    const network = fromPrismaToElectrumNetwork(bounty.network);
    const { refundBountyToMaintainer } = await import("@/lib/bounty");

    const [result] = await refundBountyToMaintainer(
      { ...bounty, status: BountyStatus.SETTLING },
      network,
      { updateStatus: false },
    );
    txId = result.txid;

    await prisma.$transaction([
      prisma.bounty.update({
        where: { id: bountyId, status: BountyStatus.SETTLING },
        data: { status: BountyStatus.REFUNDED, settlementTxId: txId },
      }),
      prisma.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: { status: "CONFIRMED", txId },
      }),
    ]);

    console.log(`✅ Web bounty ${bountyId} refunded, TX: ${txId}`);
    return { txId };
  } catch (error) {
    if (txId) {
      await prisma.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: {
          status: "BROADCAST",
          txId,
          error: error instanceof Error ? error.message : "Settlement reconciliation required",
        },
      }).catch(() => undefined);
      throw new Error("Refund was broadcast but could not be finalized. Reconciliation is required.");
    }

    await prisma.$transaction([
      prisma.bounty.update({
        where: { id: bountyId, status: BountyStatus.SETTLING },
        data: { status: BountyStatus.ACTIVE },
      }),
      prisma.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }),
    ]);
    throw error;
  }
}

export async function getWebBountyBySlug(slug: string) {
  return prisma.bounty.findFirst({
    where: { platform: Platform.WEB, webBounty: { slug } },
    include: {
      webBounty: { include: { revisions: { orderBy: { revision: "desc" } }, creator: true } },
      claims: {
        where: { status: { not: ClaimStatus.WITHDRAWN } },
        include: { claimant: true, revisions: { orderBy: { revision: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
