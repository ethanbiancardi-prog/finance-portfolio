// Which PRISM motif the site shows: the homepage artwork and the nav logo.
//
// Two designs are wired up, both kept so it's a one-line switch (more
// candidates live on /lab):
//   Crystal.tsx  a quartz cluster (six-sided prisms) that grows, then turns
//   Prism.tsx    a twisted triangular prism in string-art lines that turns
//
// To switch, change the file both lines import from.
export { PrismHero as MotifHero, PrismMark as MotifMark } from "./Prism";
// export { CrystalHero as MotifHero, CrystalMark as MotifMark } from "./Crystal";
