import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, sessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const value = request.cookies.get(sessionCookie.name)?.value;
    const sessionId = value?.split(".", 1)[0];
    if (sessionId) await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    const response = NextResponse.json({ success: true });
    response.cookies.set(sessionCookie.name, "", { ...sessionCookie.options, maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to log out" }, { status: 400 });
  }
}
