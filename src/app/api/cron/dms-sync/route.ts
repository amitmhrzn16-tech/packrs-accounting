import { NextResponse } from "next/server";
import { runDmsSync } from "@/lib/dms/dms-sync";
import { getAllEnabledConfigs } from "@/lib/dms/dms-db";

/**
 * GET /api/cron/dms-sync
 * Called by a cron job to run daily auto-sync for all enabled companies.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && secret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dateParam = url.searchParams.get("date");
    let syncDate: string;

    if (dateParam) {
      syncDate = dateParam;
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      syncDate = yesterday.toISOString().split("T")[0];
    }

    const configs = await getAllEnabledConfigs();

    if (configs.length === 0) {
      return NextResponse.json({ message: "No DMS sync configs enabled", synced: 0 });
    }

    const results = [];

    for (const config of configs) {
      try {
        const result = await runDmsSync(
          config.company_id,
          "scheduled",
          syncDate,
          syncDate
        );
        results.push({
          companyId: config.company_id,
          success: result.success,
          income: result.income,
          expense: result.expense,
          errors: result.errors,
        });
      } catch (error: any) {
        results.push({
          companyId: config.company_id,
          success: false,
          error: error?.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({
      message: `Synced ${results.length} companies for ${syncDate}`,
      date: syncDate,
      results,
    });
  } catch (error: any) {
    console.error("Cron DMS sync error:", error);
    return NextResponse.json(
      { error: error?.message || "Cron sync failed" },
      { status: 500 }
    );
  }
}
