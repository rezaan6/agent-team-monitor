import { NextResponse } from "next/server";
import { getOlderTerminalAgents } from "@/lib/agents/db";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limitParam = url.searchParams.get("limit");

  if (!before || Number.isNaN(Date.parse(before))) {
    return NextResponse.json(
      { error: "missing or invalid 'before' (ISO timestamp)" },
      { status: 400 }
    );
  }

  let limit = 50;
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "invalid 'limit'" }, { status: 400 });
    }
    limit = parsed;
  }

  const supabase = await getSupabaseServerClient();
  const result = await getOlderTerminalAgents(supabase, before, limit);
  return NextResponse.json(result);
}
