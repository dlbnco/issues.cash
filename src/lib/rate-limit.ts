import { prisma } from "@/lib/prisma";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  // A single atomic upsert shares limits across workers and server instances.
  // Database time prevents clock skew between application servers.
  const [bucket] = await prisma.$queryRaw<{ count: number; retryAfterMs: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP
        THEN 1 ELSE LEAST("RateLimitBucket"."count" + 1, ${maxRequests + 1}) END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP
        THEN CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond'
        ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP)) * 1000)::integer AS "retryAfterMs"
  `;
  return {
    allowed: bucket.count <= maxRequests,
    retryAfterMs: bucket.count <= maxRequests ? 0 : Math.max(0, bucket.retryAfterMs),
  };
}
