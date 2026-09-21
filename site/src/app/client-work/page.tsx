import { cookies } from "next/headers";
import { isClientWorkAuthenticated } from "@/lib/clientWorkAuth";
import PasscodeGate from "@/components/client-work/PasscodeGate";
import ClientWorkView from "@/components/client-work/ClientWorkView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client Work — Ethan Biancardi",
  description: "Case studies from small-business sites and software tools built by Ethan Biancardi.",
};

export default async function ClientWorkPage() {
  const cookieStore = await cookies();
  const authenticated = isClientWorkAuthenticated(cookieStore);

  if (!authenticated) {
    return <PasscodeGate />;
  }

  return <ClientWorkView />;
}
