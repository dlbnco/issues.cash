import crypto from "crypto";
import type { ElectrumNetworkProvider, TransactionBuilder } from "cashscript";
import type { TransactionResult } from "./contract";

export async function sendSettlementTransaction(
  builder: TransactionBuilder,
  provider: ElectrumNetworkProvider,
  beforeBroadcast?: (transaction: TransactionResult) => Promise<void>,
): Promise<TransactionResult> {
  if (!beforeBroadcast) return builder.send();

  const hex = builder.build();
  builder.debug();
  const hash = crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest();
  const txid = crypto.createHash("sha256").update(hash).digest().reverse().toString("hex");
  const transaction = { txid, hex };
  // Persist the exact signed transaction before it can reach the network.
  // Retrying this same transaction is safe even if the broadcast response is lost.
  await beforeBroadcast(transaction);
  await provider.sendRawTransaction(hex);
  return transaction;
}
