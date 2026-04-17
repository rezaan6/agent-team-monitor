import { NextResponse } from "next/server";
import { processHookEvent, type HookPayload } from "@/lib/agents/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HookPayload;
    const result = await processHookEvent(body);
    return NextResponse.json(result || {});
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
