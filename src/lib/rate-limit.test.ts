import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows first request", () => {
    const result = checkRateLimit("test-key", 3, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("allows requests up to max", () => {
    checkRateLimit("test-key-2", 3, 60_000);
    checkRateLimit("test-key-2", 3, 60_000);
    const third = checkRateLimit("test-key-2", 3, 60_000);
    expect(third.allowed).toBe(true);
  });

  it("blocks after max requests", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("test-key-3", 3, 60_000);
    const blocked = checkRateLimit("test-key-3", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after window expires", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("test-key-4", 3, 10_000);
    jest.advanceTimersByTime(11_000);
    const after = checkRateLimit("test-key-4", 3, 10_000);
    expect(after.allowed).toBe(true);
  });

  it("uses separate keys independently", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("key-a", 3, 60_000);
    const b = checkRateLimit("key-b", 3, 60_000);
    expect(b.allowed).toBe(true);
  });
});
