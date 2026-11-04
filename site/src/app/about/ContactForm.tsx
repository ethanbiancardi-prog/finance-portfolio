"use client";

import { useState } from "react";
import { Button, Card, Field, SelectField, inputClasses, labelClasses } from "@/components/ui";

const CATEGORIES = [
  { value: "bug", label: "Bug report" },
  { value: "question", label: "Question" },
  { value: "opportunity", label: "Opportunity" },
  { value: "other", label: "Something else" },
];

const HINTS: Record<string, string> = {
  bug: "Which page, what you did, and what happened instead. A screenshot description helps too.",
  question: "Anything about how a tool works, the numbers behind it, or how the site was built.",
  opportunity: "Internships, projects, clubs, or anything else. I'll get back to you quickly.",
  other: "Whatever's on your mind.",
};

export default function ContactForm({
  defaultName,
  defaultEmail,
  defaultCategory,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultCategory?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [category, setCategory] = useState(
    CATEGORIES.some((c) => c.value === defaultCategory) ? defaultCategory! : "question",
  );
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, category, message, website }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSending(false);
      setStatus({ text: body.error ?? "Couldn't send that. Try emailing me directly.", ok: false });
      return;
    }
    setSending(false);
    setMessage("");
    setStatus({ text: `Sent. Thanks, ${name.split(" ")[0]}. I'll reply to ${email}.`, ok: true });
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <Card as="section">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              required
              autoComplete="email"
              suffix="so I can reply"
            />
          </div>
          <SelectField label="About" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} />
          <label className="block">
            <span className={labelClasses}>Message</span>
            <textarea
              className={`${inputClasses} min-h-40 w-full resize-y leading-5`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={HINTS[category]}
              minLength={10}
              maxLength={5000}
              required
            />
          </label>
          {/* Honeypot: invisible to people, tempting to bots. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={sending} loadingLabel="Sending">
              Send message
            </Button>
            <span className="text-[11px] text-zinc-500">{message.length}/5000</span>
          </div>
          {status && (
            <p className={`text-xs ${status.ok ? "text-good" : "text-bad"}`} role="status">
              <span className="text-zinc-600">&gt; </span>
              {status.text}
            </p>
          )}
        </form>
      </Card>

      <Card padding="sm" className="h-fit">
        <p className={labelClasses}>Prefer email?</p>
        <a
          href="mailto:ethanbiancardi@gmail.com"
          className="mt-1 block break-all text-xs text-foreground underline decoration-border underline-offset-4 hover:text-accent"
        >
          ethanbiancardi@gmail.com
        </a>
        <p className="mt-3 text-[11px] leading-5 text-zinc-500">
          The form goes to the same inbox. Your email is only used to reply to you.
        </p>
      </Card>
    </div>
  );
}
