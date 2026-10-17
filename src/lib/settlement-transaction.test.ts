import crypto from "crypto";
import type { ElectrumNetworkProvider, TransactionBuilder } from "cashscript";
import { sendSettlementTransaction } from "./settlement-transaction";

it("durably saves the exact transaction and its hash before broadcasting", async () => {
  const hex = "010203";
  const events: string[] = [];
  const builder = { build: () => hex, debug: jest.fn() } as unknown as TransactionBuilder;
  const provider = { sendRawTransaction: jest.fn(async () => { events.push("broadcast"); }) } as unknown as ElectrumNetworkProvider;
  const persist = jest.fn(async () => { events.push("persist"); });
  const result = await sendSettlementTransaction(builder, provider, persist);
  const expectedId = crypto.createHash("sha256").update(
    crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest(),
  ).digest().reverse().toString("hex");
  expect(result).toEqual({ txid: expectedId, hex });
  expect(persist).toHaveBeenCalledWith(result);
  expect(events).toEqual(["persist", "broadcast"]);
  expect(provider.sendRawTransaction).toHaveBeenCalledWith(hex);
});

it("never broadcasts if saving the transaction fails or the worker is fenced out", async () => {
  const builder = { build: () => "010203", debug: jest.fn() } as unknown as TransactionBuilder;
  const provider = { sendRawTransaction: jest.fn() } as unknown as ElectrumNetworkProvider;
  await expect(sendSettlementTransaction(builder, provider, async () => {
    throw new Error("Attempt no longer pending");
  })).rejects.toThrow("Attempt no longer pending");
  expect(provider.sendRawTransaction).not.toHaveBeenCalled();
});
