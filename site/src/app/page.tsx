import { getHomeSnapshot, sparklinePoints } from "@/lib/homeSnapshot";
import PrismStage from "./PrismStage";

// The homepage is one full screen: the PRISM logo's twisted prism, large and
// interactive (PrismStage.tsx), with the name, two ways in, and the live
// paper account. No tool list here; the Tools menu in the nav has them all.
export default async function Home() {
  const snapshot = await getHomeSnapshot();
  return (
    <main className="flex flex-1 flex-col">
      <PrismStage
        snapshot={
          snapshot && {
            equity: snapshot.equity,
            changePct: snapshot.changePct,
            spark: sparklinePoints(snapshot.points, 208, 40),
            holdings: snapshot.holdings,
            lastCheck: snapshot.lastCheck,
          }
        }
      />
    </main>
  );
}
