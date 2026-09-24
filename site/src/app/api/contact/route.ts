import { NextResponse } from "next/server";
import { getRedis, kvConfigured } from "@/lib/kv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

// The contact form. Each message is saved to Supabase (contact_messages)
// first, so nothing is lost, then emailed to Ethan with Reply-To set to the
// sender, via Resend. Without RESEND_API_KEY the message is only saved.

const CATEGORIES = { bug: "Bug", question: "Question", opportunity: "Opportunity", other: "Other" } as const;
type Category = keyof typeof CATEGORIES;
const TO = process.env.CONTACT_TO_EMAIL ?? "ethanbiancardi@gmail.com";
const PER_HOUR = 5;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  // Honeypot: a field real visitors never see. Bots that fill every input
  // get a normal-looking success and nothing is stored.
  if (body.website) return NextResponse.json({ ok: true });

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const category = String(body.category ?? "") as Category;
  const message = String(body.message ?? "").trim();

  if (!name || name.length > 80) return NextResponse.json({ error: "Add your name (under 80 characters)." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "That email doesn't look right, and it's how I'll reply." }, { status: 400 });
  }
  if (!(category in CATEGORIES)) return NextResponse.json({ error: "Pick what this is about." }, { status: 400 });
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: "Messages need 10 to 5,000 characters." }, { status: 400 });
  }

  // A few messages an hour per IP is plenty for a person and stops a script.
  if (kvConfigured()) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = `contact:${ip}`;
    const count = await getRedis().incr(key);
    if (count === 1) await getRedis().expire(key, 3600);
    if (count > PER_HOUR) {
      return NextResponse.json(
        { error: `That's more than ${PER_HOUR} messages in an hour. Try again later, or email me directly.` },
        { status: 429 },
      );
    }
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: `The form isn't set up here yet. Email me at ${TO}.` }, { status: 503 });
  }

  const user = await getUser();
  const { data: saved, error } = await admin
    .from("contact_messages")
    .insert({ name, email, category, message, user_id: user?.id ?? null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: `Couldn't send that. Email me at ${TO}.` }, { status: 500 });

  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    const label = CATEGORIES[category];
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Resend's shared sender works without owning a domain, but only
        // delivers to the address the Resend account was created with.
        from: process.env.CONTACT_FROM_EMAIL ?? "Portfolio contact <onboarding@resend.dev>",
        to: [TO],
        reply_to: email,
        subject: `[${label}] ${name} via your portfolio site`,
        html:
          `<p><b>${escapeHtml(name)}</b> &lt;${escapeHtml(email)}&gt; · ${label}` +
          (user ? ` · signed in` : "") +
          `</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>` +
          `<p style="color:#888">Reply to this email to answer them directly.</p>`,
      }),
    }).catch(() => null);
    // The message is already saved, so a failed email is recorded, not fatal.
    if (res?.ok) {
      emailed = true;
      await admin.from("contact_messages").update({ emailed: true }).eq("id", saved.id);
    }
  }

  return NextResponse.json({ ok: true, emailed });
}
