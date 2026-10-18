import { isZeroCommissionProject, calculateCommission } from "./commission";
import { Platform } from "@prisma/client";

describe("WEB bounty commission", () => {
  it("isZeroCommissionProject returns false for WEB bounties", () => {
    expect(isZeroCommissionProject(Platform.WEB, "", "")).toBe(false);
  });

  it("WEB bounty commission uses global rate with no zero-commission exceptions", () => {
    process.env.COMMISSION_BPS = "150";
    process.env.ZERO_COMMISSION_PROJECTS = "github:owner/repo";

    const result = calculateCommission(
      BigInt(1_000_000),
      BigInt(1000),
      Platform.WEB,
      null,
      null,
    );

    expect(result.commissionBps).toBe(150);
    expect(result.isZeroCommissionProject).toBe(false);
    expect(result.commissionAmount).toBeGreaterThan(BigInt(0));
    expect(result.contributorAmount).toBeGreaterThan(BigInt(0));

    delete process.env.COMMISSION_BPS;
    delete process.env.ZERO_COMMISSION_PROJECTS;
  });

  it("WEB bounty with zero global commission gives full amount", () => {
    process.env.COMMISSION_BPS = "0";

    const result = calculateCommission(
      BigInt(1_000_000),
      BigInt(1000),
      Platform.WEB,
      null,
      null,
    );

    expect(result.commissionAmount).toBe(BigInt(0));
    expect(result.contributorAmount).toBe(BigInt(999_000));
    expect(result.isZeroCommissionProject).toBe(false);

    delete process.env.COMMISSION_BPS;
  });
});
