import crypto from "crypto";

// Reimplement the verification logic for unit testing
// without needing the full auth module (which imports next/headers)
function computeTelegramHash(data: Record<string, string | number>, token: string): string {
  const checkString = Object.entries(data)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHash("sha256").update(token).digest();
  return crypto.createHmac("sha256", secret).update(checkString).digest("hex");
}

function verifyTelegramLogin(
  data: { id: number; first_name: string; auth_date: number; hash: string; [key: string]: unknown },
  botToken: string,
): boolean {
  if (!data.id || !data.first_name || !data.auth_date || !data.hash) return false;
  if (Math.abs(Date.now() / 1000 - data.auth_date) > 60 * 60) return false;

  const entries: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== "hash" && typeof value === "string" || typeof value === "number") {
      entries[key] = value;
    }
  }
  const expected = computeTelegramHash(entries, botToken);

  const leftBuf = Buffer.from(expected, "hex");
  const rightBuf = Buffer.from(data.hash, "hex");
  return leftBuf.length === rightBuf.length && crypto.timingSafeEqual(leftBuf, rightBuf);
}

describe("Telegram login verification", () => {
  const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  it("accepts valid signature", () => {
    const auth_date = Math.floor(Date.now() / 1000);
    const payload = { id: 12345678, first_name: "Alice", username: "alice123", auth_date };
    const hash = computeTelegramHash(payload, BOT_TOKEN);

    expect(verifyTelegramLogin({ ...payload, hash }, BOT_TOKEN)).toBe(true);
  });

  it("rejects invalid hash", () => {
    const auth_date = Math.floor(Date.now() / 1000);
    expect(
      verifyTelegramLogin(
        { id: 12345678, first_name: "Alice", auth_date, hash: "deadbeef" },
        BOT_TOKEN,
      ),
    ).toBe(false);
  });

  it("rejects stale payload (> 1 hour)", () => {
    const auth_date = Math.floor(Date.now() / 1000) - 7200;
    const payload = { id: 12345678, first_name: "Alice", auth_date };
    const hash = computeTelegramHash(payload, BOT_TOKEN);

    expect(verifyTelegramLogin({ ...payload, hash }, BOT_TOKEN)).toBe(false);
  });

  it("rejects missing id", () => {
    expect(
      verifyTelegramLogin(
        { id: 0, first_name: "Alice", auth_date: Math.floor(Date.now() / 1000), hash: "abc" },
        BOT_TOKEN,
      ),
    ).toBe(false);
  });

  it("rejects missing first_name", () => {
    expect(
      verifyTelegramLogin(
        { id: 1, first_name: "", auth_date: Math.floor(Date.now() / 1000), hash: "abc" },
        BOT_TOKEN,
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

    expect(verifyTelegramLogin({ ...payload, hash }, BOT_TOKEN)).toBe(true);
  });
});
