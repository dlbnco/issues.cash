export const CHIPNET_HOST = "chipnet.bch.ninja";

export function assertChainTestEnvironment(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.E2E_RUN_CHIPNET !== "1") {
    throw new Error("Real transactions are opt-in. Set E2E_RUN_CHIPNET=1 to spend chipnet test coins.");
  }
  if (!env.E2E_FUNDER_WIF) throw new Error("Set E2E_FUNDER_WIF to a dedicated funded chipnet wallet (testnet WIF).");
  if (env.BCH_ELECTRUM_HOST_TESTNET3 && env.BCH_ELECTRUM_HOST_TESTNET3 !== CHIPNET_HOST) {
    throw new Error(`Chain tests only allow ${CHIPNET_HOST}; refusing another Electrum server.`);
  }
  if (env.NEXT_PUBLIC_BCH_NETWORK && env.NEXT_PUBLIC_BCH_NETWORK !== "testnet3") {
    throw new Error("Chain tests refuse a mainnet website configuration.");
  }
}
