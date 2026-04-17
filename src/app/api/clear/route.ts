import { NextResponse } from "next/server";
import { clearAllState } from "@/lib/agents/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearAllState();
  return NextResponse.json({ ok: true });
}
