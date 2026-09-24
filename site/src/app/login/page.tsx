import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Callout, PageShell } from "@/components/ui";
import { getUser, supabaseConfigured } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Already signed in? Nothing to do here.
  if (await getUser()) redirect("/dashboard");

  // Accounts need a Supabase project. Say so plainly rather than showing a
  // form that cannot work.
  if (!supabaseConfigured()) {
    return (
      <PageShell
        eyebrow="account"
        title="Sign in"
        description="Accounts are not switched on in this environment yet."
      >
        <Callout label="setup needed" title="Supabase is not configured" className="mt-4">
          <code className="text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are missing. Add
          both to <code className="text-foreground">site/.env.local</code> from your Supabase
          project&apos;s Project Settings, then restart the dev server. Every other tool on the site
          works without them.
        </Callout>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="account"
      title="Sign in"
      description="An account is only needed for the trade journal. Every other tool on the site works without one."
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </PageShell>
  );
}
