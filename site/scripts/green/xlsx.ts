// A tiny .xlsx reader for the SBTi download, so the build needs no new
// package. An .xlsx file is a zip of XML: xl/sharedStrings.xml holds every
// distinct text value once, and each sheet's cells point into it by index.
// Reads the first sheet into rows of strings. Good enough for a plain table;
// not a general Excel parser (no dates, formulas or merged cells).
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");

// "AB12" -> 27 (zero-based column index)
const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(path: string): string[][] {
  const files = unzipSync(readFileSync(path));
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    for (const si of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // A shared string can be split into styled runs: join every <t>.
      shared.push(decode([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
    }
  }
  const sheetName = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const out: string[] = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ""] = c;
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const value = /t="s"/.test(attrs) && v != null ? shared[Number(v)] : decode(inline ?? v ?? "");
      out[colIndex(ref)] = value;
    }
    rows.push(Array.from(out, (x) => x ?? ""));
  }
  return rows;
}
