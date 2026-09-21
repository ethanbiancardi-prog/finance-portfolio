"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Card, Button } from "@/components/ui";

export default function PasscodeGate() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/client-work/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        // Refresh server components to render unlocked content
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Incorrect passcode. Please try again.");
      }
    } catch {
      setError("An error occurred while verifying passcode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      eyebrow="private"
      title="Client Work"
      subtitle="Restricted Portfolio Section"
      description="Case studies from small-business sites and tools I've built."
    >
      <div className="mx-auto mt-8 max-w-md">
        <Card padding="md">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="flex h-2 w-2 rounded-full bg-accent" />
            <h2 className="text-[11px] caps-wide text-accent font-medium">
              Access Restricted
            </h2>
          </div>

          <p className="mt-3 text-xs leading-5 text-zinc-400">
            This section contains proprietary client case studies, deliverables,
            and business results. Please enter your passcode to unlock.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="passcode"
                className="block text-[10px] caps text-zinc-500 mb-1.5"
              >
                Passcode
              </label>
              <input
                id="passcode"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-zinc-600 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
            </div>

            {error && (
              <div className="rounded-[var(--radius-sm)] border border-bad/30 bg-bad/10 px-3 py-2 text-[11px] text-bad">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="solid"
              loading={loading}
              loadingLabel="Verifying..."
              disabled={!passcode.trim()}
              className="w-full justify-center"
            >
              Unlock Client Work →
            </Button>
          </form>

          <div className="mt-4 border-t border-border/50 pt-3 text-center">
            <span className="text-[10px] caps text-zinc-600">
              Need access? Contact{" "}
              <a
                href="mailto:ethanbiancardi@gmail.com"
                className="text-zinc-400 hover:text-accent underline"
              >
                ethanbiancardi@gmail.com
              </a>
            </span>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
