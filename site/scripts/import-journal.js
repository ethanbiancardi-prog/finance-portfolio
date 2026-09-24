// One-off: copy data/journal.json into the journal_entries table, owned by
// you.
//
// Deliberately does NOT use the Supabase secret key. It signs in as you with
// your email and password, exactly like the website does, and inserts under
// that session. Two reasons: the secret key bypasses Row Level Security, so a
// typo in this script could write rows under the wrong user and nothing would
// stop it; and it means there is no reason for the secret key to be on this
// machine at all.
//
// Because it runs as you, the insert policy is what stamps ownership. If this
// script tried to write a row for anyone else, the database would reject it.
//
// Usage (from site/):
//   node scripts/import-journal.js --email you@example.com --password 'yourpassword'
//   node scripts/import-journal.js --email ... --password ... --execute
//
// Without --execute it is a dry run: it reads, matches, and reports, and
// writes nothing.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// Read site/.env.local by hand: this is a plain Node script, so there is no
// Next.js around to load it.
function loadEnv() {
  const file = path.join(__dirname, "..", ".env.local");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const email = arg("email");
  const password = arg("password");

  if (!email || !password) {
    console.error("Need --email and --password (the account you sign in to the site with).");
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing from site/.env.local.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) {
    console.error("Could not sign in:", authError.message);
    process.exit(1);
  }
  const userId = auth.user.id;
  console.log(`Signed in as ${auth.user.email}`);
  console.log(`User id: ${userId}\n`);

  const entries = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "journal.json"), "utf8"),
  );
  console.log(`Found ${entries.length} entries in data/journal.json`);

  // Don't create duplicates if this is run twice: skip anything already there
  // with the same date and ticker. The read is filtered by RLS to your rows,
  // which is exactly the comparison we want.
  const { data: existing, error: readError } = await supabase
    .from("journal_entries")
    .select("date, ticker");
  if (readError) {
    console.error("Could not read existing entries:", readError.message);
    process.exit(1);
  }
  const seen = new Set((existing ?? []).map((e) => `${e.date}|${e.ticker}`));
  console.log(`You already have ${existing.length} entries in the database`);

  const rows = entries
    .filter((e) => !seen.has(`${e.date}|${e.ticker.toUpperCase()}`))
    .map((e) => ({
      user_id: userId,
      date: e.date,
      ticker: e.ticker.toUpperCase(),
      // journal.json predates this column; leave it empty rather than guess.
      company_name: null,
      action: e.action === "sell" ? "sell" : "buy",
      thesis: e.thesis,
      exit_condition: e.exitCondition,
    }));

  const skipped = entries.length - rows.length;
  if (skipped > 0) console.log(`Skipping ${skipped} already imported`);
  console.log(`To import: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  for (const r of rows) console.log(`  ${r.date}  ${r.ticker.padEnd(5)} ${r.action}`);

  if (!execute) {
    console.log("\nDry run. Re-run with --execute to write these rows.");
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("journal_entries")
    .insert(rows)
    .select();
  if (insertError) {
    console.error("\nImport failed:", insertError.message);
    process.exit(1);
  }
  console.log(`\nImported ${inserted.length} entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
