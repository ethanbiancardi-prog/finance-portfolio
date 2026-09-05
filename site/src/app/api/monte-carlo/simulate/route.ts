import { NextResponse } from "next/server";
import {
  getBlendedAssumptions,
  runMonteCarloSimulation,
  type SimulationInputs,
} from "@/lib/monteCarlo";

export async function POST(request: Request) {
  const inputs: SimulationInputs = await request.json();

  const assumptions = await getBlendedAssumptions(inputs.stockAllocationPct);
  const result = runMonteCarloSimulation(inputs, assumptions.annualReturn, assumptions.annualVolatility);

  return NextResponse.json({ ...result, assumptions });
}
