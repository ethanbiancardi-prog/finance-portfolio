import { createBrowserClient } from "@supabase/ssr";

// The browser-side Supabase client, for the login form and anything else that
// runs in the user's browser.
//
// The two values below are deliberately public (NEXT_PUBLIC_), which looks
// like it breaks the "keys stay server-side" rule in CLAUDE.md but does not.
// The anon key is not a secret: it only lets the holder attempt requests, and
// every one of those requests is then checked against the database's Row
// Level Security policies, which decide what that specific signed-in user is
// allowed to see. Supabase is built to have this key in the browser.
//
// The key that IS a secret is the service role key, which bypasses RLS
// entirely. It must never appear in a NEXT_PUBLIC_ variable or in any file
// that ships to the browser. It is used only by the one-off import script.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
