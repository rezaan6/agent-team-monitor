import { NextResponse } from "next/server";
import { cancelAgent } from "@/lib/agents/db";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  try {
    const body = (await req.json()) as { agentId?: unknown };
    const agentId = Number(body.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return NextResponse.json({ error: "invalid agentId" }, { status: 400 });
    }
    const result = await cancelAgent(supabase, agentId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 401 }
    );
  }
}
