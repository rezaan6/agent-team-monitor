import { NextResponse } from "next/server";
import { requestStop } from "@/lib/agents/db";

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
  await requestStop(agentId);
  return NextResponse.json({ ok: true });
}
