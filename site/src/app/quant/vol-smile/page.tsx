import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import { VolatilitySmileVisualizer } from "@/components/VolatilitySmileVisualizer";

export const metadata: Metadata = { title: "Options Volatility Smile" };

export default function Page() {
  return (
    <PageShell
      eyebrow="quant tools"
      title="Options Volatility Smile"
      description="Why options on the same stock trade at different implied volatilities depending on the strike. Turn the fear and skew dials, hover a strike to see its vol and Black-Scholes price."
    >
      <VolatilitySmileVisualizer />
    </PageShell>
  );
}
