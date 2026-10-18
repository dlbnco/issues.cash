import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireCurrentUser } from "@/lib/auth";
import { cancelWebBounty, updateWebBounty } from "@/lib/web-bounty";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await request.json();
    const bounty = await updateWebBounty(id, user.id, { title: input.title, body: input.body });
    return NextResponse.json(bounty);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update bounty" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = await params;
    await cancelWebBounty(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to cancel bounty" }, { status: 400 });
  }
}
