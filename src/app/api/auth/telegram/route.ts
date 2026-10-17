import { NextRequest, NextResponse } from "next/server";
import {
  createTelegramSession,
  sessionCookie,
  type TelegramLoginData,
  verifyTelegramLogin,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const data = (await request.json()) as TelegramLoginData;
    if (!verifyTelegramLogin(data)) {
      return NextResponse.json({ error: "Invalid Telegram login" }, { status: 401 });
    }

    const { user, cookieValue } = await createTelegramSession(data);
    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
      },
    });
    response.cookies.set(sessionCookie.name, cookieValue, sessionCookie.options);
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to sign in" }, { status: 400 });
  }
}
