import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import RuleTester from "./RuleTester";

export const metadata: Metadata = { title: "Rule Tester" };

export default function Page() {
  return (
    <PageShell
      eyebrow="quant tools"
      title="Rule Tester"
      description="Flip the trading bot's rules on and off and see how $100,000 would have done from 2017 to today, next to simply buying the S&P 500. Then see whether AI could have picked stocks better."
    >
      <RuleTester />
    </PageShell>
  );
}
