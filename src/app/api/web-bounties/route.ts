import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireCurrentUser } from "@/lib/auth";
import { getWebsiteNetwork } from "@/lib/network-filter";
import { createWebBounty } from "@/lib/web-bounty";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const rl = checkRateLimit(`create-bounty-${user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s` }, { status: 429 });
    }
    const input = await request.json();
    const bounty = await createWebBounty({
      creatorId: user.id,
      title: input.title,
      body: input.body,
      amountBCH: Number(input.amountBCH),
      refundAddress: input.refundAddress,
      expiryDays: Number(input.expiryDays),
      network: getWebsiteNetwork(),
    });
    return NextResponse.json({
      id: bounty.id,
      slug: bounty.webBounty?.slug,
      contractAddress: bounty.contractAddress,
      amount: bounty.amount.toString(),
      feeAmount: bounty.feeAmount?.toString(),
      locktime: bounty.locktime,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create bounty" }, { status: 400 });
  }
}
