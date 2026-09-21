import { redirect } from "next/navigation";

// /quant is the hub; the first tab is its landing page.
export default function QuantIndex() {
  redirect("/quant/backtester");
}
