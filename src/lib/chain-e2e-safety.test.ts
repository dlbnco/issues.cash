import { assertChainTestEnvironment, CHIPNET_HOST } from "../../e2e/helpers/safety";
import { assertDisposableDatabase } from "../../e2e/helpers/database";

const valid = { E2E_RUN_CHIPNET: "1", E2E_FUNDER_WIF: "provided" };

it("requires explicit opt-in and a dedicated funder", () => {
  expect(() => assertChainTestEnvironment({})).toThrow("opt-in");
  expect(() => assertChainTestEnvironment({ E2E_RUN_CHIPNET: "1" })).toThrow("E2E_FUNDER_WIF");
  expect(() => assertChainTestEnvironment(valid)).not.toThrow();
});

it("rejects mainnet configuration and non-chipnet endpoints", () => {
  expect(() => assertChainTestEnvironment({ ...valid, NEXT_PUBLIC_BCH_NETWORK: "mainnet" })).toThrow("mainnet");
  expect(() => assertChainTestEnvironment({ ...valid, BCH_ELECTRUM_HOST_TESTNET3: "bch.imaginary.cash" })).toThrow("refusing");
  expect(() => assertChainTestEnvironment({ ...valid, BCH_ELECTRUM_HOST_TESTNET3: CHIPNET_HOST })).not.toThrow();
});

it("refuses application chain tests without an explicitly named test database", () => {
  expect(() => assertDisposableDatabase(undefined)).toThrow("TEST_DATABASE_URL");
  expect(() => assertDisposableDatabase("postgresql://localhost/issuescash")).toThrow("refusing");
  expect(() => assertDisposableDatabase("https://localhost/chain_e2e")).toThrow("refusing");
  expect(assertDisposableDatabase("postgresql://localhost/chain_e2e")).toContain("chain_e2e");
});
