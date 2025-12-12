import { prisma } from "@/lib/prisma";
import type { AttemptStatus } from "@prisma/client";

export type CreateOrUpdateAttemptParams = {
  bountyId: string;
  prNumber: number;
  prUrl: string;
  contributorLogin: string;
  contributorAddress: string;
  status: AttemptStatus;
};

/**
 * Create or update an attempt for a bounty
 */
export async function createOrUpdateAttempt(
  params: CreateOrUpdateAttemptParams,
) {
  const {
    bountyId,
    prNumber,
    prUrl,
    contributorLogin,
    contributorAddress,
    status,
  } = params;

  // Check if attempt already exists
  const existing = await prisma.attempt.findUnique({
    where: {
      bountyId_prNumber: {
        bountyId,
        prNumber,
      },
    },
  });

  if (existing) {
    // Update existing attempt
    return await prisma.attempt.update({
      where: { id: existing.id },
      data: {
        contributorAddress,
        status,
        updatedAt: new Date(),
      },
    });
  }

  // Create new attempt
  return await prisma.attempt.create({
    data: {
      bountyId,
      prNumber,
      prUrl,
      contributorLogin,
      contributorAddress,
      status,
    },
  });
}

export async function updateAttemptCommentId(
  attemptId: string,
  commentId: number | bigint,
): Promise<void> {
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { commentId },
  });
}
