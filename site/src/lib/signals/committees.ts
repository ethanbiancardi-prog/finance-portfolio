// House committee assignments, from the public-domain congress-legislators
// dataset (github.com/unitedstates/congress-legislators). A member's
// committees are what make a disclosed trade interesting: a buy in a
// defence contractor by someone on Armed Services is a different lead
// from the same buy by someone on Agriculture.
//
// Members are matched by state + district ("FL18"), which the Clerk's
// index provides — more reliable than matching names.
import type { SectorKey } from "@/lib/sectors";

const BASE = "https://unitedstates.github.io/congress-legislators";

export type Committee = { id: string; name: string; parent?: string };
export type MemberInfo = {
  bioguide: string;
  name: string;
  party: string;
  state: string;
  committees: Committee[]; // full committees only; subcommittees folded into their parent
};

export type Members = {
  byDistrict: Map<string, MemberInfo>; // House: "FL18"
  bySenatorName: Map<string, MemberInfo>; // Senate: normalised "first last"
};

// Which full committees have jurisdiction over which companies. Deliberately
// conservative — the point is to flag a plausible overlap for the reader to
// check, not to assert one. A rule matches on our sector and, where the
// sector is too broad (Armed Services doesn't oversee every industrial),
// also on SEC's industry description. Thomas IDs from the dataset.
type Rule = { sectors: SectorKey[]; industry?: RegExp };
const OVERSIGHT: Record<string, Rule> = {
  // Armed Services — defence and aerospace contractors only
  HSAS: { sectors: ["industrials", "technology"], industry: /aircraft|aerospace|guided missile|ordnance|search, detection|ship ?building|defense|arms/i },
  // Financial Services — banks, insurers, brokers, payments
  HSBA: { sectors: ["financials"] },
  // Energy and Commerce — health, telecom, energy, consumer protection
  HSIF: { sectors: ["healthcare", "communications", "energy", "sustainability"] },
  // Natural Resources — extraction on public land, water, mining
  HSII: { sectors: ["energy", "industrials"], industry: /petroleum|crude|natural gas|oil|mining|coal|drilling|timber|water/i },
  // Transportation and Infrastructure — carriers, builders, water utilities
  HSPW: { sectors: ["industrials", "sustainability"], industry: /transportation|railroad|trucking|air ?line|aircraft|construction|contractor|building|water supply|highway|pipeline/i },
  // Ways and Means — Medicare/Medicaid pricing and tax policy
  HSWM: { sectors: ["healthcare"], industry: /pharmaceutical|biological|hospital|health|medical|surgical|drug/i },
  // Agriculture — food, beverage, farm inputs
  HSAG: { sectors: ["consumer", "industrials"], industry: /food|beverage|bottled|grocery|agricultur|farm|meat|grain|dairy|sugar|fertiliz|\btractor/i },
  // Judiciary — antitrust over the platforms
  HSJU: { sectors: ["technology", "communications"], industry: /prepackaged software|computer processing|data processing|information retrieval|internet|advertising|telephone|cable/i },
  // Veterans' Affairs — VA health purchasing
  HSVR: { sectors: ["healthcare"], industry: /pharmaceutical|hospital|medical|surgical|drug/i },
  // Homeland Security — cybersecurity vendors
  HSHM: { sectors: ["technology"], industry: /prepackaged software|computer|security/i },
  // --- Senate ---
  SSAS: { sectors: ["industrials", "technology"], industry: /aircraft|aerospace|guided missile|ordnance|search, detection|ship ?building|defense|arms/i }, // Armed Services
  SSBK: { sectors: ["financials"] }, // Banking, Housing, and Urban Affairs
  SSHR: { sectors: ["healthcare"] }, // Health, Education, Labor, and Pensions
  SSFI: { sectors: ["healthcare"], industry: /pharmaceutical|biological|hospital|health|medical|surgical|drug/i }, // Finance — Medicare, tax
  SSEG: { sectors: ["energy", "industrials"], industry: /petroleum|crude|natural gas|oil|mining|coal|drilling|electric/i }, // Energy and Natural Resources
  SSEV: { sectors: ["sustainability", "industrials"], industry: /water|refuse|sanitary|waste|environmental|chemical|highway|construction/i }, // Environment and Public Works
  SSCM: { sectors: ["communications", "technology", "industrials"], industry: /telephone|cable|broadcast|television|radio|internet|software|computer|semiconductor|transportation|railroad|trucking|air ?line|aircraft/i }, // Commerce, Science, and Transportation
  SSAF: { sectors: ["consumer", "industrials"], industry: /food|beverage|bottled|grocery|agricultur|farm|meat|grain|dairy|sugar|fertiliz|\btractor/i }, // Agriculture
  SSJU: { sectors: ["technology", "communications"], industry: /prepackaged software|computer processing|data processing|information retrieval|internet|advertising|telephone|cable/i }, // Judiciary
  SSVA: { sectors: ["healthcare"], industry: /pharmaceutical|hospital|medical|surgical|drug/i }, // Veterans' Affairs
  SSGA: { sectors: ["technology"], industry: /prepackaged software|computer|security/i }, // Homeland Security and Governmental Affairs
};

type Legislator = {
  id: { bioguide: string };
  name: { official_full?: string; first: string; last: string };
  terms: { type: string; state: string; district?: number; party: string; end: string }[];
};
type CommitteeRec = { thomas_id: string; name: string; type: string; subcommittees?: { thomas_id: string; name: string }[] };
type Membership = Record<string, { bioguide: string; name: string }[]>;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`congress-legislators ${path} failed (${res.status})`);
  return res.json();
}

// Senators are matched by name (the EFD site gives no state): lower-case
// first + last, punctuation and suffixes dropped, so "Angus S King, Jr."
// and "Angus King" meet in the middle.
export function senatorKey(first: string, last: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z ]/g, "").trim();
  return `${clean(first).split(" ")[0]} ${clean(last).split(" ").pop()}`;
}

// One fetch of all three files per refresh; returns member maps for both chambers.
export async function loadMembers(): Promise<Members> {
  const [legislators, committees, membership] = await Promise.all([
    getJson<Legislator[]>("legislators-current.json"),
    getJson<CommitteeRec[]>("committees-current.json"),
    getJson<Membership>("committee-membership-current.json"),
  ]);

  const committeeName = new Map<string, Committee>();
  for (const c of committees) {
    if (c.type !== "house" && c.type !== "senate") continue;
    const name = c.name.replace(/^(House|Senate) Committee on (the )?/, "");
    committeeName.set(c.thomas_id, { id: c.thomas_id, name });
    for (const s of c.subcommittees ?? []) {
      committeeName.set(c.thomas_id + s.thomas_id, { id: c.thomas_id, name, parent: c.thomas_id });
    }
  }

  const byBioguide = new Map<string, Committee[]>();
  for (const [id, members] of Object.entries(membership)) {
    const c = committeeName.get(id);
    if (!c) continue; // joint committee
    for (const m of members) {
      const list = byBioguide.get(m.bioguide) ?? [];
      if (!list.some((x) => x.id === c.id)) list.push({ id: c.id, name: c.name });
      byBioguide.set(m.bioguide, list);
    }
  }

  const byDistrict = new Map<string, MemberInfo>();
  const bySenatorName = new Map<string, MemberInfo>();
  for (const l of legislators) {
    const term = l.terms[l.terms.length - 1];
    const info: MemberInfo = {
      bioguide: l.id.bioguide,
      name: l.name.official_full ?? `${l.name.first} ${l.name.last}`,
      party: term.party,
      state: term.state,
      committees: byBioguide.get(l.id.bioguide) ?? [],
    };
    if (term.type === "rep" && term.district != null) byDistrict.set(`${term.state}${String(term.district).padStart(2, "0")}`, info);
    else if (term.type === "sen") bySenatorName.set(senatorKey(l.name.first, l.name.last), info);
  }
  return { byDistrict, bySenatorName };
}

// Committees (by id) that plausibly oversee this company.
export function oversightOverlap(committees: Committee[], sector: SectorKey | null, industry: string | null): Committee[] {
  if (!sector) return [];
  return committees.filter((c) => {
    const rule = OVERSIGHT[c.id];
    if (!rule || !rule.sectors.includes(sector)) return false;
    if (rule.industry && !(industry && rule.industry.test(industry))) return false;
    return true;
  });
}

// Sector from SEC's SIC industry description, for companies outside the
// curated universe. Keyword-based and coarse — good enough to decide which
// committee's jurisdiction to check against; a miss returns null and the
// company simply gets no overlap note.
const SIC_RULES: [RegExp, SectorKey][] = [
  // Builders and contractors first: their descriptions mention what they
  // build (pipelines, power lines), which would otherwise read as energy.
  [/construction|contractor|bldg/i, "industrials"],
  [/pharmaceutical|biological|medical|surgical|hospital|health|dental|diagnostic|laborator|drug/i, "healthcare"],
  [/bank|savings|finance|financial|insurance|credit|securit|investment|loan|mortgage|broker|asset management/i, "financials"],
  [/semiconductor|software|computer|electronic|prepackaged|data processing|instruments|office equipment|communications equipment/i, "technology"],
  [/telephone|telegraph|broadcast|cable|television|radio|motion picture|video|amusement|advertising|publishing|periodical/i, "communications"],
  [/petroleum|crude|natural gas|oil|drilling|coal|refining|pipeline/i, "energy"],
  [/electric services|solar|renewable|water supply|refuse|sanitary|waste|environmental/i, "sustainability"],
  [/retail|eating|grocery|apparel|food|beverage|bottled|household|cosmetic|hotel|lodging|restaurant|sports|recreation|toys|footwear|department store/i, "consumer"],
  [/aircraft|aerospace|guided missile|ordnance|search, detection|motor vehicle|construction|machinery|engines|railroad|trucking|transportation|metal|steel|chemical|industrial|fabricated|contractor|building|mining|paper|plastics|refrigeration|electrical/i, "industrials"],
];

export function sectorFromSic(sicDescription: string | null): SectorKey | null {
  if (!sicDescription) return null;
  for (const [re, sector] of SIC_RULES) if (re.test(sicDescription)) return sector;
  return null;
}
