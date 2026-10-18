export function assertDisposableDatabase(value: string | undefined): string {
  if (!value) throw new Error("Set TEST_DATABASE_URL to a dedicated, disposable migrated PostgreSQL database.");
  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !/(?:test|e2e)/i.test(url.pathname)) {
    throw new Error("TEST_DATABASE_URL must name a disposable database containing test or e2e; refusing a potentially live database.");
  }
  return value;
}
