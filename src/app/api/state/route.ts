import { NextResponse } from "next/server";
import { getInitialSnapshot } from "@/lib/agents/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getInitialSnapshot();
  return NextResponse.json(snapshot);
}
