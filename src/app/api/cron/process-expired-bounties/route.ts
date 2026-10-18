import { NextRequest, NextResponse } from "next/server";
import { processExpiredBounties } from "@/lib/bounty";

/**
 * Cron endpoint to process expired bounties
 *
 * This should be called periodically (e.g., every hour) by a cron service
 * like Vercel Cron, GitHub Actions, or external cron-job.org
 *
 * When a bounty's locktime has passed, this endpoint triggers the timeout()
 * function on the smart contract to refund the maintainer automatically.
 *
 * Security: Protect with CRON_SECRET environment variable
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.log(`🔄 Processing expired bounties...`);

    // Process expired bounties
    const result = await processExpiredBounties();

    console.log(
      `✅ Checked ${result.checked} expired bounties, ${result.refunded} refunded`,
    );

    return NextResponse.json({
      success: true,
      checked: result.checked,
      refunded: result.refunded,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing expired bounties:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
