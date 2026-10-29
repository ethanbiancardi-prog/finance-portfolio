import { NextResponse } from "next/server";
import { rowToPrediction, score, type PredictionRow } from "@/lib/calibration";
import { createClient, getUser } from "@/lib/supabase/server";

// The Calibration Tracker's data: the signed-in user's predictions plus the
// Brier scores, computed here on the server. Row Level Security limits every
// read and write to that user's own rows (0007_prediction_logs.sql), so no
// "where user_id = ..." is needed below.

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_logs")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const predictions = (data as PredictionRow[]).map(rowToPrediction);
  return NextResponse.json({ predictions, scores: score(predictions) });
}

// Probabilities arrive as percents (62 or 62.5) and are stored as decimals.
function percent(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 10_000 : null;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  const marketSource = String(body.marketSource ?? "").trim();
  const reasoning = String(body.reasoning ?? "").trim();
  const resolutionDate = String(body.resolutionDate ?? "").trim();
  const mine = percent(body.myProbability);
  const market = percent(body.marketProbability);

  if (!question || !marketSource || !reasoning || !/^\d{4}-\d{2}-\d{2}$/.test(resolutionDate)) {
    return NextResponse.json({ error: "Question, source, resolution date and reasoning are all required." }, { status: 400 });
  }
  if (mine === null || market === null) {
    return NextResponse.json({ error: "Both probabilities must be between 0 and 100%." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_logs")
    .insert({
      user_id: user.id, // from the verified session, never the request body
      question: question.slice(0, 300),
      my_probability: mine,
      market_probability_at_entry: market,
      market_source: marketSource.slice(0, 100),
      resolution_date: resolutionDate,
      reasoning: reasoning.slice(0, 280),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(rowToPrediction(data as PredictionRow));
}
