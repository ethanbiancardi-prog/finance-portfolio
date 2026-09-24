import { PageShell } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import ContactForm from "./ContactForm";

export const metadata = { title: "Contact" };

export default async function Contact({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  // Signed in? Fill in what we already know.
  const user = await getUser();
  const { type } = await searchParams;

  return (
    <PageShell
      eyebrow="contact"
      title="Get in touch"
      description="Found a bug, have a question about how something works, or want to talk about an opportunity? Send it here and it lands straight in my inbox."
    >
      <ContactForm
        defaultName={String(user?.user_metadata?.full_name ?? "")}
        defaultEmail={user?.email ?? ""}
        defaultCategory={type}
      />
    </PageShell>
  );
}
