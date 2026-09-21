"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, SectionHeader, Card, Button } from "@/components/ui";
import { CASE_STUDIES } from "@/data/clientWork";

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-[11px] caps-tight text-zinc-400">
      {children}
    </span>
  );
}

export default function ClientWorkView() {
  const router = useRouter();
  const [locking, setLocking] = useState(false);

  async function handleLock() {
    setLocking(true);
    try {
      await fetch("/api/client-work/auth", { method: "DELETE" });
      router.refresh();
    } catch {
      // Refresh regardless
      router.refresh();
    } finally {
      setLocking(false);
    }
  }

  return (
    <PageShell
      eyebrow="client work"
      title="Client Case Studies"
      subtitle="Websites & software tools built for small businesses"
      description="Real problems, shipped solutions, and measurable business impact."
    >
      <div className="flex items-center justify-between border-b border-border py-2 mb-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-good animate-pulse" />
          <span className="text-[10px] caps text-good">
            Passcode Authenticated (Private Access)
          </span>
        </div>
        <Button
          variant="outline"
          onClick={handleLock}
          loading={locking}
          loadingLabel="Locking..."
          className="text-[10px]"
        >
          🔒 Lock Page
        </Button>
      </div>

      <div className="space-y-8">
        {CASE_STUDIES.map((study, idx) => (
          <section key={study.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-zinc-500 font-mono">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] caps-wide text-accent font-medium">
                  {study.client}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs text-zinc-400">{study.industry}</span>
              </div>
              <span className="text-[10px] caps text-zinc-500">{study.timeline}</span>
            </div>

            <Card padding="md">
              <h2 className="text-base font-semibold text-foreground">
                {study.title}
              </h2>
              <p className="mt-1 text-xs text-zinc-400 leading-5">
                {study.summary}
              </p>

              {/* Tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {study.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* The Problem */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] caps text-zinc-500 font-medium">
                    The Problem
                  </h3>
                  <p className="text-xs leading-5 text-zinc-300">
                    {study.problem}
                  </p>
                </div>

                {/* What Shipped */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] caps text-zinc-500 font-medium">
                    What Shipped
                  </h3>
                  <p className="text-xs leading-5 text-zinc-300">
                    {study.whatShipped.overview}
                  </p>
                  <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-zinc-400">
                    {study.whatShipped.highlights.map((item, i) => (
                      <li key={i} className="leading-5">
                        <span className="text-zinc-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Key Results Grid */}
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-[10px] caps text-zinc-500 font-medium mb-3">
                  Measurable Impact
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {study.results.map((res, i) => (
                    <div
                      key={i}
                      className="rounded-[var(--radius-sm)] border border-border bg-background/50 p-3"
                    >
                      <div className="text-lg font-bold tabular-nums text-accent">
                        {res.metric}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-zinc-400">
                        {res.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Learnings & Takeaways */}
              {study.learnings && (
                <div className="mt-4 rounded-[var(--radius-sm)] bg-border/20 p-3 text-xs leading-5 text-zinc-400">
                  <span className="font-semibold text-zinc-200">Key takeaway: </span>
                  {study.learnings}
                </div>
              )}
            </Card>
          </section>
        ))}
      </div>

      <section className="mt-10 border-t border-border pt-6">
        <SectionHeader label="inquiries" />
        <p className="mt-2 text-xs leading-5 text-zinc-400">
          Interested in discussing custom web development or software tooling for your business?
        </p>
        <a
          href="mailto:ethanbiancardi@gmail.com"
          className="mt-3 inline-block text-xs text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
        >
          ethanbiancardi@gmail.com
        </a>
      </section>
    </PageShell>
  );
}
