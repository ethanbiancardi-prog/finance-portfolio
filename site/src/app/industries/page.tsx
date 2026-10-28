import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import Industries from "./Industries";

export const metadata: Metadata = { title: "Industry Charts" };

export default function Page() {
  return (
    <PageShell
      eyebrow="research"
      title="Industry Charts"
      description="The big names in each industry on one chart, so you can see at a glance who's leading, who's lagging, and how the whole sector compares with the S&P 500. Pick a sector and a time period."
    >
      <Industries />
    </PageShell>
  );
}
