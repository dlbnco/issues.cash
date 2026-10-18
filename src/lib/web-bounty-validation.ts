import type { Prisma } from "@prisma/client";

export function assertBody(body: unknown): asserts body is Prisma.InputJsonValue {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Bounty description is required");
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 50_000) {
    throw new Error("Bounty description is too large");
  }
}

export function assertTitle(title: string): string {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160) {
    throw new Error("Title must be between 1 and 160 characters");
  }
  return title.trim();
}

export function createSlug(title: string, id: string): string {
  const words = title.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 72) || "bounty";
  return `${words}-${id.slice(0, 8)}`;
}
