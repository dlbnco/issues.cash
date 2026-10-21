import { test } from "vitest";
import { ChainHarness } from "./helpers/chain";

test("recovers a previous Chipnet test run using its original funder", async () => {
  if (!process.env.E2E_RECOVER_MANIFEST) throw new Error("Set E2E_RECOVER_MANIFEST to the saved manifest.json");
  const harness = new ChainHarness(process.env.E2E_RECOVER_MANIFEST);
  try { await harness.cleanup(true); }
  finally { await harness.close(); }
}, 180_000);
