import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { TransactionBuilder } from "cashscript";
import { checkBountyFunding, completeBounty, getOracleFeePKH, refundBounty, timeoutBounty } from "@/lib/contract";
import { ChainHarness, ESCROW_FUNDING, REWARD, waitFor } from "./helpers/chain";

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
    await h.fund(escrow.address, BigInt(50_575));
    await h.fund(escrow.address, BigInt(50_575));
    await h.waitCoins(escrow.address, BigInt(101_150));
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
