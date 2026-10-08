import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import StrategyLab from "./StrategyLab";

export const metadata: Metadata = { title: "Strategy Lab" };

export default function Page() {
  return (
    <PageShell
      eyebrow="quant tools"
      title="Strategy Lab"
      description="Five classic trading strategies, from buy-and-hold to the 'Turtle' breakout rules, replayed day by day on real prices since 2017. Same $100,000, same stocks, same costs: which approach would have done best, and how bumpy was the ride?"
    >
      <StrategyLab />
    </PageShell>
  );
}
