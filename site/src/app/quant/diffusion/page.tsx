import type { Metadata } from "next";
import { PageShell } from "@/components/ui";
import Diffusion from "./Diffusion";

export const metadata: Metadata = { title: "News Speed" };

export default function Page() {
  return (
    <PageShell
      eyebrow="quant research"
      title="How Fast Is News Priced In?"
      description="When a company files news with the SEC (earnings, a CEO leaving, a big deal), how long until the stock price reflects it? Minutes, or weeks? Every 8-K from ~210 large US companies since 2021, timed to the minute."
    >
      <Diffusion />
    </PageShell>
  );
}
