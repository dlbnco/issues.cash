import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireCurrentUser } from "@/lib/auth";
import { refundWebBounty } from "@/lib/web-bounty";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = await params;
    const result = await refundWebBounty(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refund bounty" },
      { status: 400 },
    );
  }
}
