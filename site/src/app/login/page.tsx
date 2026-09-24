import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Already signed in? Nothing to do here.
  if (await getUser()) redirect("/dashboard");

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
