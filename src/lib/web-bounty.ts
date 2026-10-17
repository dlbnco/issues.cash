import crypto from "crypto";
import { BCHNetwork, BountyStatus, ClaimStatus, Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bchToSats, validateAddressForNetwork, validateBountyAmount } from "@/lib/commands";
import { UNLOCKING_TX_FEE_AMOUNT } from "@/lib/constants";
import { createBounty, createConfig } from "@/lib/contract";
import { fromPrismaToElectrumNetwork } from "@/lib/network";
import { assertBody, assertTitle, createSlug } from "@/lib/web-bounty-validation";
export { awardWebBounty, refundWebBounty } from "@/lib/web-settlement";

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
  const title = assertTitle(input.title);
  assertBody(input.body);
  if (!Number.isInteger(input.expiryDays) || input.expiryDays < 1 || input.expiryDays > 365) {
    throw new Error("Expiry must be between 1 and 365 days");
  }
  const network = networkName(input.network);
  const amountValidation = validateBountyAmount(input.amountBCH, network);
  if (!amountValidation.valid) throw new Error(amountValidation.error);
  const addressValidation = validateAddressForNetwork(input.refundAddress, network);
  if (!addressValidation.valid) throw new Error(addressValidation.error);

  const id = crypto.randomUUID();
  const config = createConfig(network, "./contracts/DynamicBounty.cash", `./oracle-key-${network}.json`);
  const contract = createBounty(config, `web:${id}`, input.refundAddress, input.expiryDays);
  const body = input.body;
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
      amount: BigInt(bchToSats(input.amountBCH)),
      feeAmount: UNLOCKING_TX_FEE_AMOUNT,
      webBounty: {
        create: {
          slug: createSlug(title, id), title, body, creatorId: input.creatorId,
          revisions: { create: { revision: 1, title, body } },
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
  const title = assertTitle(input.title);
  assertBody(input.body);
  const body = input.body;
  return prisma.$transaction(async (tx) => {
    // All web bounty mutations lock the bounty row before inspecting claims/revisions.
    await tx.bounty.update({
      where: {
        id: bountyId, platform: Platform.WEB,
        status: { in: [BountyStatus.PENDING_FUNDING, BountyStatus.ACTIVE] },
        webBounty: { creatorId, cancelledAt: null },
      },
      data: { updatedAt: new Date() },
    });
    const web = await tx.webBounty.findUniqueOrThrow({ where: { bountyId } });
    const revision = web.revision + 1;
    return tx.webBounty.update({
      where: { bountyId },
      data: { title, body, revision, revisions: { create: { revision, title, body } } },
    });
  });
}

export async function cancelWebBounty(bountyId: string, creatorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.bounty.update({
      where: {
        id: bountyId, platform: Platform.WEB, status: BountyStatus.PENDING_FUNDING,
        webBounty: { creatorId },
      },
      data: { updatedAt: new Date() },
    });
    // Never delete escrow parameters: a payment may already be in flight.
    // The funding cron refunds any deposits to cancelled escrows, even partial ones.
    await tx.webBounty.update({ where: { bountyId }, data: { cancelledAt: new Date() } });
  });
}

export interface ClaimInput {
  payoutAddress: string;
  body: string;
  workUrl?: string;
}

function validateClaim(input: ClaimInput, network: BCHNetwork): void {
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 10_000) {
    throw new Error("Claim details must be between 1 and 10000 characters");
  }
  const addressValidation = validateAddressForNetwork(input.payoutAddress, networkName(network));
  if (!addressValidation.valid) throw new Error(addressValidation.error);
  if (input.workUrl) {
    try {
      if (new URL(input.workUrl).protocol !== "https:") throw new Error();
    } catch {
      throw new Error("Work URL must be a valid HTTPS URL");
    }
  }
}

export async function createOrUpdateClaim(bountyId: string, claimantId: string, input: ClaimInput) {
  return prisma.$transaction(async (tx) => {
    const bounty = await tx.bounty.update({
      where: { id: bountyId, platform: Platform.WEB, status: BountyStatus.ACTIVE, webBounty: { cancelledAt: null } },
      data: { updatedAt: new Date() },
    });
    validateClaim(input, bounty.network);
    const existing = await tx.claim.findUnique({ where: { bountyId_claimantId: { bountyId, claimantId } } });
    if (!existing) {
      return tx.claim.create({
        data: { bountyId, claimantId, revisions: { create: { revision: 1, ...input } } },
        include: { revisions: true },
      });
    }
    if (existing.status !== ClaimStatus.PENDING) throw new Error("This claim can no longer be edited");
    const revision = existing.currentRevision + 1;
    return tx.claim.update({
      where: { id: existing.id },
      data: { currentRevision: revision, revisions: { create: { revision, ...input } } },
      include: { revisions: true },
    });
  });
}

export async function withdrawClaim(bountyId: string, claimantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.bounty.update({
      where: { id: bountyId, platform: Platform.WEB, status: BountyStatus.ACTIVE },
      data: { updatedAt: new Date() },
    });
    await tx.claim.update({
      where: { bountyId_claimantId: { bountyId, claimantId }, status: ClaimStatus.PENDING },
      data: { status: ClaimStatus.WITHDRAWN },
    });
  });
}

export async function getWebBountyBySlug(slug: string) {
  return prisma.bounty.findFirst({
    where: { platform: Platform.WEB, webBounty: { slug } },
    include: {
      webBounty: { include: { revisions: { orderBy: { revision: "desc" } }, creator: true } },
      claims: {
        where: { status: { not: ClaimStatus.WITHDRAWN } },
        include: { claimant: true, revisions: { orderBy: { revision: "desc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
