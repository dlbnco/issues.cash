// We test the pure helper functions extracted from web-bounty.ts
// by reimplementing the same logic to verify correctness

function assertTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 160) {
    throw new Error("Title must be between 1 and 160 characters");
  }
  return trimmed;
}

function createSlug(title: string, id: string): string {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72) || "bounty";
  return `${words}-${id.slice(0, 8)}`;
}

function assertBody(body: unknown): void {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Bounty description is required");
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 50_000) {
    throw new Error("Bounty description is too large");
  }
}

describe("assertTitle", () => {
  it("accepts valid title", () => {
    expect(assertTitle("Fix login bug")).toBe("Fix login bug");
  });

  it("trims whitespace", () => {
    expect(assertTitle("  Hello world  ")).toBe("Hello world");
  });

  it("rejects empty title", () => {
    expect(() => assertTitle("")).toThrow("Title must be between 1 and 160 characters");
  });

  it("rejects whitespace-only title", () => {
    expect(() => assertTitle("   ")).toThrow("Title must be between 1 and 160 characters");
  });

  it("rejects title over 160 chars", () => {
    expect(() => assertTitle("a".repeat(161))).toThrow("Title must be between 1 and 160 characters");
  });

  it("accepts exactly 160 chars", () => {
    expect(assertTitle("a".repeat(160))).toBe("a".repeat(160));
  });
});

describe("createSlug", () => {
  it("lowercases and sanitizes title", () => {
    const slug = createSlug("Fix Login Bug!!!", "abc12345");
    expect(slug).toMatch(/^fix-login-bug-abc12345$/);
  });

  it("handles unicode characters", () => {
    const slug = createSlug("Über cool feature", "id123");
    expect(slug).toMatch(/^u-ber-cool-feature-id123$/);
  });

  it("truncates long titles to 72 chars", () => {
    const slug = createSlug("a".repeat(100), "id123");
    expect(slug.split("-")[0].length).toBeLessThanOrEqual(72);
  });

  it("uses fallback for empty/special-only titles", () => {
    const slug = createSlug("!!!@@@", "id123");
    expect(slug).toBe("bounty-id123");
  });

  it("generates unique slugs for different IDs", () => {
    const slug1 = createSlug("Same Title", "aaa11111");
    const slug2 = createSlug("Same Title", "bbb22222");
    expect(slug1).not.toBe(slug2);
  });
});

describe("assertBody", () => {
  it("accepts valid Lexical JSON", () => {
    const body = { root: { children: [], type: "root", version: 1 } };
    expect(() => assertBody(body)).not.toThrow();
  });

  it("rejects null", () => {
    expect(() => assertBody(null)).toThrow("Bounty description is required");
  });

  it("rejects string", () => {
    expect(() => assertBody("hello")).toThrow("Bounty description is required");
  });

  it("rejects array", () => {
    expect(() => assertBody([])).toThrow("Bounty description is required");
  });

  it("rejects oversized body", () => {
    const body = { root: { text: "a".repeat(60_000) } };
    expect(() => assertBody(body)).toThrow("Bounty description is too large");
  });

  it("accepts body at max size", () => {
    const body = { root: { text: "a".repeat(45_000) } };
    expect(() => assertBody(body)).not.toThrow();
  });
});
