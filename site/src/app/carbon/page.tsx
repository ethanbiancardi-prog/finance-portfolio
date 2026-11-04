import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import CarbonExplorer from "./CarbonExplorer";

export const metadata: Metadata = { title: "Carbon Intensity" };

export default function Page() {
  return (
    <PageShell
      eyebrow="environmental finance"
      title="Carbon Intensity"
      description="How much greenhouse gas S&P 500 companies' US facilities release for every $1 million of sales, from the EPA's facility-by-facility reports. The number sustainability funds screen on: it shows who would be hit hardest if carbon ever had a price."
    >
      <CarbonExplorer />
    </PageShell>
  );
}
