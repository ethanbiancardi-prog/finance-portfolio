import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import { RegimeBacktester } from "@/components/RegimeBacktester";

export const metadata: Metadata = { title: "Regime Backtester" };

export default function Page() {
  return (
    <PageShell
      eyebrow="quant tools"
      title="Regime Backtester"
      description="How a trend-following, leveraged momentum book (the same rule as the live strategy) behaves through four very different markets. Pick a regime; every figure is computed from the path."
    >
      <RegimeBacktester />
    </PageShell>
  );
}
