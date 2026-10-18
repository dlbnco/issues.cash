import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { TransactionBuilder } from "cashscript";
import { CashAddressType, encodeCashAddress } from "@bitauth/libauth";
import { addressToPKH, checkBountyFunding, completeBounty, getOracleFeePKH, refundBounty, signOracleMessage, timeoutBounty, type BountyContractInfo } from "@/lib/contract";
import { ChainHarness, ESCROW_FUNDING, REWARD, waitFor } from "./helpers/chain";

const SCRIPT_REJECTION = /script|signature|checkdatasig|mandatory/i;

function completeSignature(
  h: ChainHarness,
  issueHash: string,
  contributorAddress: string,
  contributorAmount: bigint,
  oracleFeePKH: Buffer | null,
  commissionAmount: bigint,
) {
  const contributorAmountBuffer = Buffer.alloc(8);
  contributorAmountBuffer.writeBigInt64LE(contributorAmount);
  const commissionAmountBuffer = Buffer.alloc(8);
  commissionAmountBuffer.writeBigInt64LE(commissionAmount);
  return signOracleMessage(Buffer.concat([
    Buffer.from("COMPLETE"), Buffer.from(issueHash, "hex"), addressToPKH(contributorAddress),
    contributorAmountBuffer, oracleFeePKH ?? Buffer.alloc(20), commissionAmountBuffer,
  ]), h.config.oracleKeys.privateKey);
}

async function rejectedComplete(
  h: ChainHarness,
  escrow: BountyContractInfo,
  contributorAddress: string,
  contributorAmount: bigint,
  outputs: { to: string; amount: bigint }[],
  options: { signedIssueHash?: string; oracleFeePKH?: Buffer | null; commissionAmount?: bigint } = {},
) {
  const coins = await h.coins(escrow.address);
  const oracleFeePKH = options.oracleFeePKH ?? null;
  const commissionAmount = options.commissionAmount ?? BigInt(0);
  const signature = completeSignature(
    h, options.signedIssueHash ?? escrow.issueHash, contributorAddress, contributorAmount, oracleFeePKH, commissionAmount,
  );
  const builder = new TransactionBuilder({ provider: h.config.provider });
  builder.addInputs(coins, escrow.contract.unlock.complete(
    addressToPKH(contributorAddress), contributorAmount, oracleFeePKH ?? Buffer.alloc(20), commissionAmount, signature,
  ));
  for (const output of outputs) builder.addOutput(output);
  const hex = builder.build();
  await expect(h.config.provider.sendRawTransaction(hex)).rejects.toThrow(SCRIPT_REJECTION);
  expect((await h.coins(escrow.address)).map((coin) => `${coin.txid}:${coin.vout}`))
    .toEqual(coins.map((coin) => `${coin.txid}:${coin.vout}`));
}

async function rejectedRefund(
  h: ChainHarness,
  escrow: BountyContractInfo,
  signedAmount: bigint,
  outputs: { to: string; amount: bigint }[],
) {
  const coins = await h.coins(escrow.address);
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigInt64LE(signedAmount);
  const signature = signOracleMessage(Buffer.concat([Buffer.from("REFUND"), Buffer.from(escrow.issueHash, "hex"), amountBuffer]), h.config.oracleKeys.privateKey);
  const builder = new TransactionBuilder({ provider: h.config.provider });
  builder.addInputs(coins, escrow.contract.unlock.refund(signedAmount, signature));
  for (const output of outputs) builder.addOutput(output);
  const hex = builder.build();
  await expect(h.config.provider.sendRawTransaction(hex)).rejects.toThrow(SCRIPT_REJECTION);
  expect((await h.coins(escrow.address)).map((coin) => `${coin.txid}:${coin.vout}`))
    .toEqual(coins.map((coin) => `${coin.txid}:${coin.vout}`));
}

describe("real Chipnet escrow transactions", () => {
  let chain: ChainHarness | undefined;
  beforeAll(async () => {
    chain = new ChainHarness();
    await chain.preflight();
  });
  afterEach(async () => { await chain?.cleanup(); });

  test.each([BigInt(0), BigInt(2_000)])("funds and pays an escrow with %s sats commission", async (commission) => {
    const h = chain!;
    const creator = h.wallet(`creator-${commission}`);
    const claimant = h.wallet(`claimant-${commission}`);
    const escrow = h.escrow(`award-${commission}`, creator.address);
    await h.fund(escrow.address);
    const funding = await checkBountyFunding(h.config, escrow.address);
    expect(funding.confirmed).toBe(ESCROW_FUNDING);
    const payout = await completeBounty(
      escrow.contract, h.config.provider, claimant.address, REWARD - commission,
      escrow.issueHash, h.config.oracleKeys.privateKey,
      commission ? getOracleFeePKH(h.config.oracleKeys) : null, commission,
    );
    h.record("payout", payout);
    const tx = await h.outputs(payout.txid);
    expect(tx.outputs).toHaveLength(commission ? 2 : 1);
    await h.assertOutput(payout.txid, claimant.address, REWARD - commission);
    if (commission) await h.assertOutput(payout.txid, h.config.oracleKeys.address, commission);
    await waitFor("escrow to be spent", async () => (await h.coins(escrow.address)).length === 0 ? true : undefined);
  });

  test("refunds the actual funded amount to the maintainer", async () => {
    const h = chain!;
    const creator = h.wallet("refund-creator");
    const escrow = h.escrow("refund", creator.address);
    await h.fund(escrow.address);
    const refund = await refundBounty(escrow.contract, h.config.provider, creator.address, escrow.issueHash, h.config.oracleKeys.privateKey);
    h.record("refund", refund.transaction);
    expect(refund.refundedAmount).toBe(REWARD);
    expect((await h.outputs(refund.transaction.txid)).outputs).toHaveLength(1);
    await h.assertOutput(refund.transaction.txid, creator.address, REWARD);
  });

  test("spends two deposits in one payout with the per-input fee", async () => {
    const h = chain!;
    const creator = h.wallet("multi-creator");
    const claimant = h.wallet("multi-claimant");
    const escrow = h.escrow("multi", creator.address);
    await h.fund(escrow.address, BigInt(50_750));
    await h.fund(escrow.address, BigInt(50_750));
    await h.waitCoins(escrow.address, BigInt(101_500));
    const payout = await completeBounty(escrow.contract, h.config.provider, claimant.address, REWARD, escrow.issueHash, h.config.oracleKeys.privateKey, null, BigInt(0));
    h.record("multi-input payout", payout);
    expect((await h.outputs(payout.txid)).inputs).toHaveLength(2);
    await h.assertOutput(payout.txid, claimant.address, REWARD);
  });

  test("uses the real chain median time to exercise the timeout path", async () => {
    const h = chain!;
    const creator = h.wallet("timeout-creator");
    const escrow = h.escrow("timeout", creator.address, (await h.medianTimePast()) - 1);
    await h.fund(escrow.address);
    const refund = await timeoutBounty(escrow.contract, h.config.provider, creator.address, escrow.locktime);
    h.record("timeout", refund.transaction);
    await h.assertOutput(refund.transaction.txid, creator.address, REWARD);
  });

  test("spends three deposits in a payout transaction", async () => {
    const h = chain!;
    const creator = h.wallet("three-input-payout-creator");
    const claimant = h.wallet("three-input-payout-claimant");
    const escrow = h.escrow("three-input-payout", creator.address);
    for (let i = 0; i < 3; i += 1) await h.fund(escrow.address, BigInt(34_000));
    await h.waitCoins(escrow.address, BigInt(102_000));
    const payout = await completeBounty(escrow.contract, h.config.provider, claimant.address, REWARD, escrow.issueHash, h.config.oracleKeys.privateKey, null, BigInt(0));
    h.record("three-input payout", payout);
    await h.assertOutput(payout.txid, claimant.address, REWARD);
  }, 90_000);

  test.each([
    ["refund", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const refund = await refundBounty(escrow.contract, h.config.provider, creator, escrow.issueHash, h.config.oracleKeys.privateKey);
      h.record("three-input refund", refund.transaction);
      expect(refund.refundedAmount).toBe(BigInt(100_001));
    }],
    ["timeout", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const refund = await timeoutBounty(escrow.contract, h.config.provider, creator, escrow.locktime);
      h.record("three-input timeout", refund.transaction);
      expect(refund.refundedAmount).toBe(BigInt(100_001));
    }],
  ])("spends three deposits in a %s transaction", async (_path, spend) => {
    const h = chain!;
    const creator = h.wallet(`three-input-${_path}-creator`);
    const locktime = _path === "timeout" ? (await h.medianTimePast()) - 1 : undefined;
    const escrow = h.escrow(`three-input-${_path}`, creator.address, locktime);
    for (let i = 0; i < 3; i += 1) await h.fund(escrow.address, BigInt(33_767));
    await h.waitCoins(escrow.address, BigInt(101_301));
    await spend(h, escrow, creator.address);
  });

  test("pays the signed amount from an overfunded escrow", async () => {
    const h = chain!;
    const creator = h.wallet("overfunded-creator");
    const claimant = h.wallet("overfunded-claimant");
    const escrow = h.escrow("overfunded", creator.address);
    await h.fund(escrow.address, ESCROW_FUNDING + BigInt(5_000));
    const payout = await completeBounty(escrow.contract, h.config.provider, claimant.address, REWARD, escrow.issueHash, h.config.oracleKeys.privateKey, null, BigInt(0));
    h.record("overfunded payout", payout);
    await h.assertOutput(payout.txid, claimant.address, REWARD);
  });

  test.each([
    ["a different contributor", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const signedFor = h.wallet("signature-contributor");
      await rejectedComplete(h, escrow, signedFor.address, REWARD, [{ to: creator, amount: REWARD }]);
    }],
    ["a different contributor amount", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      await rejectedComplete(h, escrow, creator, REWARD, [{ to: creator, amount: REWARD - BigInt(1) }]);
    }],
    ["an extra output", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const extra = h.wallet("extra-output");
      await rejectedComplete(h, escrow, creator, REWARD, [{ to: creator, amount: REWARD }, { to: extra.address, amount: BigInt(546) }]);
    }],
    ["a missing commission output", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const fee = BigInt(2_000);
      await rejectedComplete(h, escrow, creator, REWARD - fee, [{ to: creator, amount: REWARD - fee }], {
        oracleFeePKH: getOracleFeePKH(h.config.oracleKeys), commissionAmount: fee,
      });
    }],
    ["a commission output with the wrong recipient", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const fee = BigInt(2_000);
      const other = h.wallet("wrong-commission-recipient");
      await rejectedComplete(h, escrow, creator, REWARD - fee, [{ to: creator, amount: REWARD - fee }, { to: other.address, amount: fee }], {
        oracleFeePKH: getOracleFeePKH(h.config.oracleKeys), commissionAmount: fee,
      });
    }],
    ["a commission output with the wrong amount", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const fee = BigInt(2_000);
      await rejectedComplete(h, escrow, creator, REWARD - fee, [{ to: creator, amount: REWARD - fee }, { to: h.config.oracleKeys.address, amount: fee - BigInt(1) }], {
        oracleFeePKH: getOracleFeePKH(h.config.oracleKeys), commissionAmount: fee,
      });
    }],
  ])("rejects a valid payout signature reused with %s", async (_case, build) => {
    const h = chain!;
    const creator = h.wallet(`reused-payout-${_case}`);
    const escrow = h.escrow(`reused-payout-${_case}`, creator.address);
    await h.fund(escrow.address, BigInt(105_000));
    await build(h, escrow, creator.address);
  });

  test("rejects a payout signature from a different issue", async () => {
    const h = chain!;
    const creator = h.wallet("different-issue-creator");
    const escrow = h.escrow("different-issue", creator.address);
    const otherEscrow = h.escrow("different-issue-signature", creator.address);
    await h.fund(escrow.address, BigInt(105_000));
    await rejectedComplete(h, escrow, creator.address, REWARD, [{ to: creator.address, amount: REWARD }], {
      signedIssueHash: otherEscrow.issueHash,
    });
  });

  test.each([
    ["an earlier transaction locktime", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const coins = await h.coins(escrow.address);
      const builder = new TransactionBuilder({ provider: h.config.provider });
      builder.addInputs(coins, escrow.contract.unlock.timeout());
      builder.addOutput({ to: creator, amount: REWARD });
      builder.setLocktime(escrow.locktime - 1);
      await expect(h.config.provider.sendRawTransaction(builder.build())).rejects.toThrow(SCRIPT_REJECTION);
    }],
    ["the wrong recipient", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const other = h.wallet("timeout-wrong-recipient");
      const coins = await h.coins(escrow.address);
      const builder = new TransactionBuilder({ provider: h.config.provider });
      builder.addInputs(coins, escrow.contract.unlock.timeout());
      builder.addOutput({ to: other.address, amount: REWARD });
      builder.setLocktime(escrow.locktime);
      await expect(h.config.provider.sendRawTransaction(builder.build())).rejects.toThrow(SCRIPT_REJECTION);
    }],
    ["two outputs", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const other = h.wallet("timeout-extra-output");
      const coins = await h.coins(escrow.address);
      const builder = new TransactionBuilder({ provider: h.config.provider });
      builder.addInputs(coins, escrow.contract.unlock.timeout());
      builder.addOutput({ to: creator, amount: REWARD });
      builder.addOutput({ to: other.address, amount: BigInt(546) });
      builder.setLocktime(escrow.locktime);
      await expect(h.config.provider.sendRawTransaction(builder.build())).rejects.toThrow(SCRIPT_REJECTION);
    }],
  ])("rejects timeout with %s", async (_case, build) => {
    const h = chain!;
    const creator = h.wallet(`invalid-timeout-${_case}`);
    const escrow = h.escrow(`invalid-timeout-${_case}`, creator.address, (await h.medianTimePast()) - 1);
    await h.fund(escrow.address);
    await build(h, escrow, creator.address);
  });

  test("rejects a payout to a P2SH address", async () => {
    const h = chain!;
    const creator = h.wallet("p2sh-payout-creator");
    const escrow = h.escrow("p2sh-payout", creator.address);
    const p2sh = encodeCashAddress({ type: CashAddressType.p2sh, payload: addressToPKH(creator.address), prefix: "bchtest" }).address;
    await h.fund(escrow.address);
    await rejectedComplete(h, escrow, p2sh, REWARD, [{ to: p2sh, amount: REWARD }]);
  });

  test.each([
    ["a different amount", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) =>
      rejectedRefund(h, escrow, REWARD, [{ to: creator, amount: REWARD - BigInt(1) }])],
    ["a different recipient", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const other = h.wallet("wrong-refund-recipient");
      await rejectedRefund(h, escrow, REWARD, [{ to: other.address, amount: REWARD }]);
    }],
    ["two outputs", async (h: ChainHarness, escrow: BountyContractInfo, creator: string) => {
      const other = h.wallet("extra-refund-output");
      await rejectedRefund(h, escrow, REWARD, [{ to: creator, amount: REWARD }, { to: other.address, amount: BigInt(546) }]);
    }],
  ])("rejects a valid refund signature reused with %s", async (_case, build) => {
    const h = chain!;
    const creator = h.wallet(`reused-refund-${_case}`);
    const escrow = h.escrow(`reused-refund-${_case}`, creator.address);
    await h.fund(escrow.address, BigInt(105_000));
    await build(h, escrow, creator.address);
  });

  test("the network rejects an invalid oracle signature without spending the escrow", async () => {
    const h = chain!;
    const creator = h.wallet("invalid-creator");
    const escrow = h.escrow("invalid", creator.address);
    await h.fund(escrow.address);
    const coins = await h.coins(escrow.address);
    const builder = new TransactionBuilder({ provider: h.config.provider });
    builder.addInputs(coins, escrow.contract.unlock.refund(REWARD, new Uint8Array(64).fill(1)));
    builder.addOutput({ to: creator.address, amount: REWARD });
    // Deliberately bypass local debug so this assertion exercises network validation.
    const hex = builder.build();
    await expect(h.config.provider.sendRawTransaction(hex)).rejects.toThrow(/script|signature|checkdatasig/i);
    expect((await h.coins(escrow.address)).map((coin) => `${coin.txid}:${coin.vout}`))
      .toEqual(coins.map((coin) => `${coin.txid}:${coin.vout}`));
  });
});
