import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import Calibration from "./Calibration";

export const metadata: Metadata = { title: "Calibration Tracker", robots: { index: false, follow: false } };

export default async function Page() {
  // proxy.ts redirects signed-out visitors too; a page showing one person's
  // data checks for itself as well.
  const user = await getUser();
  if (!user) redirect("/login?next=/calibration");

  return (
    <PageShell
      eyebrow="forecasting"
      title="Calibration Tracker"
      description="Log a prediction with your own probability next to what the market was pricing. When it resolves, you get scored against the market: are your probabilities better than the crowd's?"
    >
      <Calibration />
    </PageShell>
  );
}
