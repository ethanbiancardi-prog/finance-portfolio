"use client";

import { Card } from "@/components/ui";
import { CrystalHero } from "@/components/Crystal";
import { PrismHero } from "@/components/Prism";
import { LineArt } from "@/components/lab/LineArt";
import { SCENES } from "@/components/lab/scenes";

const canvas = "block aspect-[5/4] w-full";

const DESIGNS = [
  { name: "Quartz cluster", note: "Pinned. Six-sided crystals growing from rock, with glints and sparkles.", art: <CrystalHero className={canvas} /> },
  { name: "Twisted prism", note: "Live on the site now. String-art triangular prism, twisting as it turns.", art: <PrismHero className={canvas} /> },
  { name: "Basalt columns", note: "Stone columns rising to heights that follow a price walk: a rock that's secretly a bar chart.", art: <LineArt scene={SCENES.basalt} label="Basalt columns rising like a bar chart" className={canvas} /> },
  { name: "Cut diamond", note: "A round brilliant cut drawing its facets in, then turning with a glint round the edge.", art: <LineArt scene={SCENES.diamond} label="A brilliant-cut diamond in fine lines" className={canvas} /> },
  { name: "Low-poly rock", note: "A faceted boulder, 80 faces, drawn from the bottom up, then slowly tumbling.", art: <LineArt scene={SCENES.rock} label="A faceted low-poly rock, slowly tumbling" className={canvas} /> },
  { name: "Geode", note: "A cracked-open stone with crystal points growing inward from the rim.", art: <LineArt scene={SCENES.geode} label="A geode with crystals growing inward" className={canvas} /> },
];

export function LabGrid() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {DESIGNS.map((d, i) => (
        <Card key={d.name} as="section" padding="sm">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] tabular-nums text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="text-base text-foreground">{d.name}</h2>
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{d.note}</p>
          <div className="mt-2">{d.art}</div>
        </Card>
      ))}
    </div>
  );
}
