import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// The server-side Supabase client, for Server Components and API routes.
//
// It reads the session out of the request's cookies, so every query it makes
// runs *as the signed-in user*. That is what lets Row Level Security do its
// job: the database sees a real user id and can filter rows to that person.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. Harmless here: proxy.ts
            // refreshes the session on every request, so the cookie is
            // already up to date by the time a page renders.
          }
        },
      },
    },
  );
}

// Who is signed in, or null. Use this rather than reading the session
// directly — getUser() re-validates the token with Supabase, while reading
// the cookie alone would trust whatever the browser sent.
export async function getUser() {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Mirrors kvConfigured() in lib/kv.ts: the app has to keep working when the
// Supabase env vars are not set yet. Without this, every page on the site
// fails, because proxy.ts runs on all of them.
export function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
