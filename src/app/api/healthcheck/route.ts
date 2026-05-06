import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint pinged by an external cron to keep the Supabase free-tier
// project from auto-pausing after 7 days of DB inactivity. Runs a trivial
// query so it counts as real database activity.
export async function GET() {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
