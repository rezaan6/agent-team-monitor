import { NextResponse } from "next/server";
import { requestStop } from "@/lib/agents/db";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agentId = parseInt(id, 10);
  if (!Number.isFinite(agentId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  try {
    await requestStop(supabase, agentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    const status = msg === "unauthenticated" ? 401 : 404;
    return NextResponse.json({ error: msg }, { status });
  }
}
