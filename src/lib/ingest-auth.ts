import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface IngestAuth {
  userId: string;
  defaultProject: string | null;
  tokenId: number;
}

/**
 * Validate an `Authorization: Bearer <token>` header against the ingest_tokens
 * table. Returns the owning user_id + default project on success, or null.
 * Runs in O(1) via a unique index on token_hash.
 */
export async function authorizeIngest(req: Request): Promise<IngestAuth | null> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const hash = createHash("sha256").update(token).digest("hex");

  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("ingest_tokens")
    .select("id, user_id, default_project, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Fire-and-forget last_used_at update
  supabase
    .from("ingest_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});

  return {
    userId: data.user_id,
    defaultProject: data.default_project ?? null,
    tokenId: data.id,
  };
}
