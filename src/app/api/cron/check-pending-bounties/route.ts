import { NextRequest, NextResponse } from "next/server";
import { checkPendingBounties } from "@/lib/bounty";

/**
 * Cron endpoint to check pending bounties for funding
 *
 * This should be called periodically (e.g., every 5-10 minutes) by a cron service
 * like Vercel Cron, GitHub Actions, or external cron-job.org
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

    console.log(`🔄 Checking pending bounties...`);

    // Check pending bounties
    const result = await checkPendingBounties();

    console.log(
      `✅ Checked ${result.checked} bounties, ${result.funded} newly funded`,
    );

    return NextResponse.json({
      success: true,
      checked: result.checked,
      funded: result.funded,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking pending bounties:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
