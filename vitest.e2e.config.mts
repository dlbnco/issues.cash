import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: process.env.E2E_OFFLINE === "1"
      ? ["e2e/**/*.unit.test.ts"]
      : process.env.E2E_RECOVER_MANIFEST
        ? ["e2e/recovery.chain.test.ts"]
        : ["e2e/escrow.chain.test.ts", "e2e/web-bounty.chain.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 180_000,
    retry: 0,
    // Stop before funding more escrows after an unexpected live-test failure.
    // afterEach still runs recovery for the failing case.
    bail: process.env.E2E_OFFLINE === "1" ? 0 : 1,
  },
});
