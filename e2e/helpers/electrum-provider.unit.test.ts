import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ElectrumNetworkProvider } from "cashscript";
import { ElectrumClient } from "@electrum-cash/network";
import { ElectrumTransportError, isElectrumTransportError, RecoveringElectrumProvider } from "@/lib/electrum-provider";
import { createProvider } from "@/lib/contract";

let provider: RecoveringElectrumProvider;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(ElectrumNetworkProvider.prototype, "connect").mockResolvedValue();
  vi.spyOn(ElectrumNetworkProvider.prototype, "disconnect").mockResolvedValue(true);
  vi.spyOn(ElectrumClient.prototype, "disconnect").mockResolvedValue(true);
  vi.spyOn(ElectrumNetworkProvider.prototype, "performRequest").mockResolvedValue({ height: 123 });
  provider = new RecoveringElectrumProvider("testnet3", "chipnet.bch.ninja");
});
afterEach(async () => {
  await provider.disconnect();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("discards a failed TLS handshake and reconnects with a new client", async () => {
  const connect = vi.mocked(ElectrumNetworkProvider.prototype.connect);
  connect.mockRejectedValueOnce(new Error("Client network socket disconnected before secure TLS connection was established"));
  const result = provider.getBlockHeight();
  await vi.advanceTimersByTimeAsync(250);
  await expect(result).resolves.toBe(123);
  expect(connect).toHaveBeenCalledTimes(2);
  expect(connect.mock.contexts[0]).not.toBe(connect.mock.contexts[1]);
  expect(ElectrumClient.prototype.disconnect).toHaveBeenCalledWith(true);
});

test("retries a lost broadcast reply using only the identical signed hex", async () => {
  const request = vi.mocked(ElectrumNetworkProvider.prototype.performRequest);
  request.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce("txid");
  const result = provider.sendRawTransaction("010203");
  await vi.advanceTimersByTimeAsync(250);
  await expect(result).resolves.toBe("txid");
  expect(request.mock.calls).toEqual([
    ["blockchain.transaction.broadcast", "010203"],
    ["blockchain.transaction.broadcast", "010203"],
  ]);
  expect(request.mock.contexts[0]).not.toBe(request.mock.contexts[1]);
});

test.each([
  "mandatory-script-verify-flag-failed",
  "daemon error: min relay fee not met",
  "daemon error: No such mempool or blockchain transaction",
])("does not retry a node rejection or poison the next request: %s", async (message) => {
  const request = vi.mocked(ElectrumNetworkProvider.prototype.performRequest);
  request.mockRejectedValueOnce(new Error(message));
  await expect(provider.sendRawTransaction("010203")).rejects.toThrow(message);
  expect(request).toHaveBeenCalledTimes(1);
  await expect(provider.getBlockHeight()).resolves.toBe(123);
  expect(ElectrumNetworkProvider.prototype.connect).toHaveBeenCalledTimes(1);
});

test("bounds retries and allows a later request to recover after exhaustion", async () => {
  const connect = vi.mocked(ElectrumNetworkProvider.prototype.connect);
  connect.mockRejectedValue(new Error("Cannot initiate a new socket connection when an existing connection exists"));
  const failed = expect(provider.getBlockHeight()).rejects.toThrow(ElectrumTransportError);
  await vi.advanceTimersByTimeAsync(750);
  await failed;
  expect(connect).toHaveBeenCalledTimes(3);
  expect(new Set(connect.mock.contexts).size).toBe(3);
  connect.mockResolvedValue();
  await expect(provider.getBlockHeight()).resolves.toBe(123);
  expect(connect).toHaveBeenCalledTimes(4);
});

test("serializes concurrent requests and shares the connected client", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const request = vi.mocked(ElectrumNetworkProvider.prototype.performRequest);
  request.mockImplementationOnce(async () => { await gate; return { height: 122 }; });
  const first = provider.getBlockHeight();
  const second = provider.getBlockHeight();
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(1);
  release();
  await expect(Promise.all([first, second])).resolves.toEqual([122, 123]);
  expect(ElectrumNetworkProvider.prototype.connect).toHaveBeenCalledTimes(1);
});

test("closes idle clients and opens a fresh one for the next request", async () => {
  await provider.getBlockHeight();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(ElectrumClient.prototype.disconnect).toHaveBeenCalledTimes(1);
  await provider.getBlockHeight();
  expect(ElectrumNetworkProvider.prototype.connect).toHaveBeenCalledTimes(2);
});

test("uses the recovering provider for the configured testnet endpoint only", () => {
  vi.stubEnv("BCH_ELECTRUM_HOST_TESTNET3", "chipnet.bch.ninja");
  expect(createProvider("testnet3")).toBeInstanceOf(RecoveringElectrumProvider);
  expect(createProvider("mainnet")).not.toBeInstanceOf(RecoveringElectrumProvider);
  vi.stubEnv("BCH_ELECTRUM_HOST_TESTNET3", "");
  expect(createProvider("testnet3")).not.toBeInstanceOf(RecoveringElectrumProvider);
});

test("bounds a hanging request, force-closes its client, and retries on a new one", async () => {
  const request = vi.mocked(ElectrumNetworkProvider.prototype.performRequest);
  request.mockImplementationOnce(() => new Promise(() => undefined));
  const result = provider.getBlockHeight();
  await vi.advanceTimersByTimeAsync(10_250);
  await expect(result).resolves.toBe(123);
  expect(ElectrumClient.prototype.disconnect).toHaveBeenCalledWith(true);
  expect(ElectrumNetworkProvider.prototype.connect).toHaveBeenCalledTimes(2);
});

describe("transport error classification", () => {
  test("does not treat a daemon's network-related message as a lost socket", () => {
    expect(isElectrumTransportError(new Error("daemon error: network policy timeout"))).toBe(false);
    expect(isElectrumTransportError(new Error("WebSocket is not open"))).toBe(true);
  });
});
