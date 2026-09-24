import { createClient } from "@supabase/supabase-js";

// The server-only Supabase client, authenticated with the SECRET key.
//
// This key bypasses Row Level Security entirely, so it is used for exactly
// one job: writing paper trades, whose price must come from the server and
// never from the browser (see supabase/migrations/0003_place_paper_trade.sql).
// Every read still goes through the user's own client in server.ts, where
// RLS applies.
//
// It must never be imported from a client component. The variable has no
// NEXT_PUBLIC_ prefix, so Next.js will not bundle its value for the browser
// even by accident, and the guard below fails loudly if this file ever runs
// there.
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must only run on the server");
  }
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
