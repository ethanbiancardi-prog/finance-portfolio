import { QuantHubHeader } from "@/components/QuantHubHeader";

// The three quant sandboxes share the sub-nav; the Optimizer and Monte
// Carlo pages render the same header themselves so all five tabs match.
export default function QuantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <QuantHubHeader />
      {children}
    </>
  );
}
