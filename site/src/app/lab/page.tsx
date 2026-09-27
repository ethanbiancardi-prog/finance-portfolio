import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import { LabGrid } from "./LabGrid";

// Design lab: every candidate PRISM motif side by side, animating, to pick
// from. Not linked anywhere and kept out of search results.
export const metadata: Metadata = { title: "Design lab", robots: { index: false, follow: false } };

export default function Lab() {
  return (
    <PageShell
      eyebrow="design lab"
      title="PRISM motifs"
      description="Every candidate design for the homepage artwork and logo, animating side by side. Refresh to replay the builds. The one on the homepage is chosen in components/Motif.ts."
    >
      <LabGrid />
    </PageShell>
  );
}
