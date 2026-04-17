#!/usr/bin/env node
// Creates the admin + test user in Supabase Auth, mints an ingest token for
// the admin, and prints the plaintext token to stdout ONCE.
//
// Usage:
//   node --env-file=.env.local scripts/seed-users.mjs
//
// Env required in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ADMIN_EMAIL, ADMIN_PASSWORD   (seed target)
//   TEST_EMAIL, TEST_PASSWORD     (demo account)

import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TEST_EMAIL = process.env.TEST_EMAIL ?? "test@demo.local";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "demo-1234";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env.local.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  // admin.listUsers is paginated; for a small install one page suffices.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function upsertUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  ✓ user ${email} already exists (${existing.id})`);
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`  + created ${email} (${data.user.id})`);
  return data.user;
}

async function mintToken(userId, label, defaultProject) {
  // If an unrevoked token with this label already exists, revoke it first.
  await supabase
    .from("ingest_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("label", label)
    .is("revoked_at", null);

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("ingest_tokens").insert({
    user_id: userId,
    label,
    token_hash: hash,
    default_project: defaultProject,
  });
  if (error) throw error;
  return token;
}

async function main() {
  console.log("Seeding users…");
  const admin = await upsertUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const test = await upsertUser(TEST_EMAIL, TEST_PASSWORD);

  // Ensure global_state rows exist (the trigger on auth.users handles new
  // inserts, but existing users pre-trigger won't have one).
  for (const u of [admin, test]) {
    await supabase.from("global_state").upsert({ user_id: u.id }, { onConflict: "user_id" });
  }

  console.log("\nMinting ingest token for admin…");
  const token = await mintToken(admin.id, "default", "agent-monitor");

  console.log("\n==============================================================");
  console.log("  MONITOR_INGEST_TOKEN (plaintext — shown once, never stored)");
  console.log("==============================================================");
  console.log("  " + token);
  console.log("==============================================================");
  console.log("\nPaste this into your .claude/settings.json under \"env\":");
  console.log(`    "MONITOR_INGEST_TOKEN": "${token}"`);
  console.log("\nUsers created:");
  console.log(`  admin  id=${admin.id}  email=${ADMIN_EMAIL}`);
  console.log(`  test   id=${test.id}  email=${TEST_EMAIL}  password=${TEST_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
