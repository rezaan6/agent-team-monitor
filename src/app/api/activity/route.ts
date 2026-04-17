import { NextResponse } from "next/server";
import { processActivity, type ActivityPayload } from "@/lib/agents/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ActivityPayload;
    await processActivity(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
