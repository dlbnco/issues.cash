import { checkRateLimit } from "./rate-limit";
import { prisma } from "./prisma";

jest.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: jest.fn() } }));

describe("checkRateLimit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows the first request and the last request within the limit", async () => {
    for (const count of [1, 3]) {
      jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count, retryAfterMs: 60_000 }]);
      await expect(checkRateLimit("key", 3, 60_000)).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    }
  });

  it("blocks requests above the shared database count", async () => {
    jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: 4, retryAfterMs: 12_345 }]);
    await expect(checkRateLimit("key", 3, 60_000)).resolves.toEqual({ allowed: false, retryAfterMs: 12_345 });
  });

  it("fails closed when the shared database is unavailable", async () => {
    jest.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(checkRateLimit("key", 3, 60_000)).rejects.toThrow("Database unavailable");
  });
});
