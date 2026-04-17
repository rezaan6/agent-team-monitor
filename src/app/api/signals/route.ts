import { NextResponse } from "next/server";
import { fetchAndConsumePendingStops } from "@/lib/agents/db";
import { authorizeIngest } from "@/lib/ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the local machine's stop-signal helper script.
 * Returns the agent IDs with pending stop requests (for the token's owner)
 * and marks them consumed.
 */
export async function GET(req: Request) {
  const auth = await authorizeIngest(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ids = await fetchAndConsumePendingStops(auth.userId);
  return NextResponse.json({ stopAgentIds: ids });
}
