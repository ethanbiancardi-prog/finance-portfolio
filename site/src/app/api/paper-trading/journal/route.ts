import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { rowToEntry, type JournalRow } from "@/lib/journal";

// The journal lives in Postgres, one row per entry, owned by a user.
//
// Two things keep one user's entries away from another's, and the second is
// the one that actually matters:
//
// 1. This route requires a signed-in user and stamps inserts with their id.
// 2. Row Level Security in the database filters every read and write to that
//    user's rows regardless of what this code asks for. If the check below
//    were deleted tomorrow, the database would still refuse to hand over
//    somebody else's rows.
//
// See supabase/migrations/0001_journal_entries.sql for the policies.

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = await createClient();
  // No "where user_id = ..." here on purpose: RLS applies it. Adding it would
  // change nothing, and leaving it out keeps it obvious where the guarantee
  // comes from.
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data as JournalRow[]).map(rowToEntry));
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const date = String(body.date ?? "").trim();
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  const action = body.action === "sell" ? "sell" : "buy";
  const thesis = String(body.thesis ?? "").trim();
  const exitCondition = String(body.exitCondition ?? "").trim();
  const companyName = String(body.companyName ?? "").trim() || null;

  if (!date || !ticker || !thesis || !exitCondition) {
    return NextResponse.json(
      { error: "date, ticker, thesis and exitCondition are all required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_entries")
    // user_id is set from the verified session, never from the request body.
    // A client that tried to post someone else's id would be rejected by the
    // insert policy's with check anyway.
    .insert({
      user_id: user.id,
      date,
      ticker,
      company_name: companyName,
      action,
      thesis,
      exit_condition: exitCondition,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(rowToEntry(data as JournalRow));
}
