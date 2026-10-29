import { NextResponse } from "next/server";
import { rowToPrediction, type PredictionRow } from "@/lib/calibration";
import { createClient, getUser } from "@/lib/supabase/server";

// One prediction. POST { outcome: "yes" | "no" } resolves it; DELETE removes
// it while it's still open. Both limits (resolve once, never touch a
// resolved row) are enforced by the database trigger in
// 0007_prediction_logs.sql; this route just passes along its refusal.

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  if (body.outcome !== "yes" && body.outcome !== "no") {
    return NextResponse.json({ error: 'outcome must be "yes" or "no"' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_logs")
    // resolved_at is stamped by the trigger with the server's clock; this
    // placeholder only satisfies the "set together" check.
    .update({ outcome: body.outcome === "yes", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .is("outcome", null)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found, or already resolved." }, { status: 404 });
  return NextResponse.json(rowToPrediction(data as PredictionRow));
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_logs")
    .delete()
    .eq("id", id)
    .is("outcome", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Not found, or already resolved." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
