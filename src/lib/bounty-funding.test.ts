import { prisma } from "./prisma";
import { checkPendingBounties, processExpiredBounties } from "./bounty";
import { checkBountyFunding } from "./contract";
import { refundCancelledWebBounty, timeoutWebBounty } from "./web-settlement";

jest.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: jest.fn(), bounty: { findMany: jest.fn(), update: jest.fn() },
  webBounty: { findUniqueOrThrow: jest.fn() },
} }));
jest.mock("./contract", () => ({ createConfig: jest.fn(), checkBountyFunding: jest.fn() }));
jest.mock("./commands", () => ({}));
jest.mock("./messages", () => ({}));
jest.mock("./github/api", () => ({}));
jest.mock("./gitlab/api", () => ({}));
jest.mock("./web-settlement", () => ({ refundCancelledWebBounty: jest.fn(), timeoutWebBounty: jest.fn() }));

const bounty = {
  id: "cancelled", platform: "WEB", network: "MAINNET", amount: BigInt(100000), feeAmount: BigInt(1000),
  contractAddress: "escrow", webBounty: { cancelledAt: new Date() },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) =>
    (callback as (tx: typeof prisma) => Promise<unknown>)(prisma));
});
afterEach(() => jest.restoreAllMocks());

it("refunds recoverable partial deposits to archived escrows without activating them", async () => {
  jest.mocked(prisma.bounty.findMany).mockResolvedValue([bounty] as never);
  jest.mocked(checkBountyFunding).mockResolvedValue({ address: "escrow", confirmed: BigInt(5000), funded: true });
  await expect(checkPendingBounties()).resolves.toEqual({ checked: 1, funded: 0 });
  expect(refundCancelledWebBounty).toHaveBeenCalledWith("cancelled");
  expect(prisma.bounty.update).not.toHaveBeenCalled();
});

it("retains archived empty escrows to catch later deposits", async () => {
  jest.mocked(prisma.bounty.findMany).mockResolvedValue([bounty] as never);
  jest.mocked(checkBountyFunding).mockResolvedValue({ address: "escrow", confirmed: BigInt(0), funded: false });
  await checkPendingBounties();
  expect(refundCancelledWebBounty).not.toHaveBeenCalled();
  expect(prisma.bounty.update).not.toHaveBeenCalled();
});

it("rechecks cancellation after locking before activating a web bounty", async () => {
  jest.mocked(prisma.bounty.findMany).mockResolvedValue([{ ...bounty, webBounty: { cancelledAt: null } }] as never);
  jest.mocked(checkBountyFunding).mockResolvedValue({ address: "escrow", confirmed: BigInt(101000), funded: true });
  jest.mocked(prisma.webBounty.findUniqueOrThrow).mockResolvedValue(bounty.webBounty as never);
  await expect(checkPendingBounties()).resolves.toEqual({ checked: 1, funded: 0 });
  expect(prisma.bounty.update).toHaveBeenCalledTimes(1);
  expect(prisma.bounty.update).toHaveBeenCalledWith(expect.objectContaining({ data: { updatedAt: expect.any(Date) } }));
});

it("routes web expiry through the reserved settlement flow", async () => {
  jest.mocked(prisma.bounty.findMany).mockResolvedValue([{ ...bounty, status: "ACTIVE" }] as never);
  await expect(processExpiredBounties()).resolves.toEqual({ checked: 1, refunded: 1, errors: [] });
  expect(timeoutWebBounty).toHaveBeenCalledWith("cancelled");
});
