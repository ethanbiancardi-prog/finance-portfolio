import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import { FactorRiskAttribution } from "@/components/FactorRiskAttribution";

export const metadata: Metadata = { title: "Factor Risk Attribution" };

export default function Page() {
  return (
    <PageShell
      eyebrow="quant tools"
      title="Factor Risk Attribution"
      description="Where a multi-asset portfolio's risk actually comes from. Set the stock / bond / commodity mix and see it broken into equity beta, interest-rate duration and inflation shock — a 60/40 is mostly one bet."
    >
      <FactorRiskAttribution />
    </PageShell>
  );
}
