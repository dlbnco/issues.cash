import crypto from "crypto";
import { assertSameOrigin, verifyTelegramLogin } from "./auth";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

function computeTelegramHash(data: Record<string, string | number>, token: string): string {
  const checkString = Object.entries(data)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHash("sha256").update(token).digest();
  return crypto.createHmac("sha256", secret).update(checkString).digest("hex");
}

describe("Telegram login verification", () => {
  const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  beforeEach(() => { process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN; });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  it("accepts valid signature", () => {
    const auth_date = Math.floor(Date.now() / 1000);
    const payload = { id: 12345678, first_name: "Alice", username: "alice123", auth_date };
    const hash = computeTelegramHash(payload, BOT_TOKEN);

    expect(verifyTelegramLogin({ ...payload, hash })).toBe(true);
  });

  it("rejects invalid hash", () => {
    const auth_date = Math.floor(Date.now() / 1000);
    expect(
      verifyTelegramLogin(
        { id: 12345678, first_name: "Alice", auth_date, hash: "deadbeef" },
      ),
    ).toBe(false);
  });

  it("rejects stale payload (> 1 hour)", () => {
    const auth_date = Math.floor(Date.now() / 1000) - 7200;
    const payload = { id: 12345678, first_name: "Alice", auth_date };
    const hash = computeTelegramHash(payload, BOT_TOKEN);

    expect(verifyTelegramLogin({ ...payload, hash })).toBe(false);
  });

  it("rejects missing id", () => {
    expect(
      verifyTelegramLogin(
        { id: 0, first_name: "Alice", auth_date: Math.floor(Date.now() / 1000), hash: "abc" },
      ),
    ).toBe(false);
  });

  it("rejects missing first_name", () => {
    expect(
      verifyTelegramLogin(
        { id: 1, first_name: "", auth_date: Math.floor(Date.now() / 1000), hash: "abc" },
      ),
    ).toBe(false);
  });

  it("handles payload with optional fields", () => {
    const auth_date = Math.floor(Date.now() / 1000);
    const payload = {
      id: 99999,
      first_name: "Bob",
      last_name: "Smith",
      photo_url: "https://example.com/photo.jpg",
      auth_date,
    };
    const hash = computeTelegramHash(payload, BOT_TOKEN);

    expect(verifyTelegramLogin({ ...payload, hash })).toBe(true);
  });
});

describe("assertSameOrigin", () => {
  it("accepts same-origin requests", () => {
    expect(() => assertSameOrigin(new Request("https://issues.cash", {
      headers: { origin: "https://issues.cash", host: "issues.cash" },
    }))).not.toThrow();
  });

  it("rejects cross-site form posts and missing origins", () => {
    for (const origin of ["https://attacker.example", ""]) {
      expect(() => assertSameOrigin(new Request("https://issues.cash", {
        headers: { origin, host: "issues.cash", "content-type": "text/plain" },
      }))).toThrow("Invalid request origin");
    }
  });
});
