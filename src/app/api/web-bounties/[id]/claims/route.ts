import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireCurrentUser } from "@/lib/auth";
import { createOrUpdateClaim } from "@/lib/web-bounty";
import { checkRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = await params;
    const rl = await checkRateLimit(`claim-${user.id}-${id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s` }, { status: 429 });
    }
    const input = await request.json();
    const claim = await createOrUpdateClaim(id, user.id, {
      payoutAddress: input.payoutAddress,
      body: input.body,
      workUrl: input.workUrl || undefined,
    });
    return NextResponse.json(claim, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save claim" }, { status: 400 });
  }
}
