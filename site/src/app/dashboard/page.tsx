import { redirect } from "next/navigation";
import { Button, Card, PageShell, SectionHeader } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import Journal from "./Journal";
import Portfolio from "./Portfolio";

export default async function Dashboard() {
  // proxy.ts already redirects signed-out visitors, but a page that shows
  // one person's data should never depend on a redirect elsewhere being
  // correct. Check here too.
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <PageShell
      eyebrow="account"
      title="Dashboard"
      description="Your private area: your paper portfolio, your trade journal, and the account they belong to."
    >
      <Card as="section" className="mt-4">
        <SectionHeader label="signed in as" />
        <p className="mt-2 text-sm text-foreground">{user.email}</p>
        <dl className="mt-3 divide-y divide-border/60 border-t border-border/60">
          <div className="grid grid-cols-[6rem_1fr] gap-3 py-1.5">
            <dt className="text-xs text-zinc-500">User ID</dt>
            <dd className="font-mono text-[11px] leading-5 break-all text-zinc-400">{user.id}</dd>
          </div>
          <div className="grid grid-cols-[6rem_1fr] gap-3 py-1.5">
            <dt className="text-xs text-zinc-500">Joined</dt>
            <dd className="text-xs leading-5 text-zinc-400">
              {new Date(user.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
        <form action={signOut} className="mt-4">
          <Button variant="outline">Sign out</Button>
        </form>
      </Card>

      <Portfolio />

      <Journal />
    </PageShell>
  );
}
