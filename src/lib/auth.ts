import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "issues_cash_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TELEGRAM_MAX_AGE_SECONDS = 60 * 60;

export interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyTelegramLogin(data: TelegramLoginData): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !data.id || !data.first_name || !data.auth_date || !data.hash) return false;

  if (Math.abs(Date.now() / 1000 - data.auth_date) > TELEGRAM_MAX_AGE_SECONDS) return false;

  const checkString = Object.entries(data)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHash("sha256").update(token).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  return timingSafeEqual(expected, data.hash);
}

export async function createTelegramSession(data: TelegramLoginData) {
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(data.id) },
    update: {
      username: data.username ?? null,
      firstName: data.first_name,
      lastName: data.last_name ?? null,
      photoUrl: data.photo_url ?? null,
    },
    create: {
      telegramId: BigInt(data.id),
      username: data.username ?? null,
      firstName: data.first_name,
      lastName: data.last_name ?? null,
      photoUrl: data.photo_url ?? null,
    },
  });
  const token = crypto.randomBytes(32).toString("base64url");
  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      userId: user.id,
    },
  });

  return { user, cookieValue: `${session.id}.${token}` };
}

export const sessionCookie = {
  name: SESSION_COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
};

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) return null;

  const separator = value.indexOf(".");
  if (separator < 1) return null;
  const sessionId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !timingSafeEqual(session.tokenHash, hashToken(token))) {
    return null;
  }

  return session.user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new Error("Invalid request origin");
  }
}
