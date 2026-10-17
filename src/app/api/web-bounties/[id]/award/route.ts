import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireCurrentUser } from "@/lib/auth";
import { awardWebBounty } from "@/lib/web-bounty";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = await params;
    const { claimId } = await request.json();
    if (!claimId) {
      return NextResponse.json({ error: "claimId is required" }, { status: 400 });
    }
    const result = await awardWebBounty(id, claimId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to award bounty" },
      { status: 400 },
    );
  }
}
