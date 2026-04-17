import { NextResponse } from "next/server";
import { fetchAndConsumePendingStops } from "@/lib/agents/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the local machine's stop-signal helper script.
 * Returns the agent IDs with pending stop requests and marks them consumed.
 * The helper then writes /tmp/claude-stop-${id} locally, which your Claude
 * Code hooks read to short-circuit the agent.
 */
export async function GET() {
  const ids = await fetchAndConsumePendingStops();
  return NextResponse.json({ stopAgentIds: ids });
}
