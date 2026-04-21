import { NextResponse } from "next/server";
import { fetchAndConsumePendingStops } from "@/lib/agents/db";
import { authorizeIngest } from "@/lib/ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the local machine's stop-signal helper script.
 * Returns pending stop requests (for the token's owner) as
 * { agentId, sessionId } pairs and marks them consumed. The poller keys
 * signal files by sessionId so PreToolUse hooks can match tool calls to
 * the agent the user clicked Stop on.
 */
export async function GET(req: Request) {
  const auth = await authorizeIngest(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stops = await fetchAndConsumePendingStops(auth.userId);
  return NextResponse.json({ stops });
}
