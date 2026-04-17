import { NextResponse } from "next/server";
import { processHookEvent, type HookPayload } from "@/lib/agents/db";
import { authorizeIngest } from "@/lib/ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorizeIngest(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as HookPayload;
    const project = body.project ?? auth.defaultProject ?? null;
    const result = await processHookEvent(body, auth.userId, project);
    return NextResponse.json(result || {});
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
