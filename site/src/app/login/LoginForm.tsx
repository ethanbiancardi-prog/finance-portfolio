"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Callout, Card, Field } from "@/components/ui";
import { signIn, signUp } from "./actions";

const initial = { error: null as string | null };

export default function LoginForm() {
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [inState, inAction, inPending] = useActionState(signIn, initial);
  const [upState, upAction, upPending] = useActionState(signUp, initial);
  const error = inState.error ?? upState.error;
  const pending = inPending || upPending;

  return (
    <Card as="section" className="mt-4 max-w-md">
      {/* One form, two submit buttons: the same email and password either
          signs you in or creates the account, so nobody has to pick a mode
          before typing anything. */}
      <form className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          suffix="8 characters or more"
        />

        {error && (
          <p className="text-xs leading-5 text-bad" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button formAction={inAction} loading={inPending} loadingLabel="Signing in" disabled={pending}>
            Sign in
          </Button>
          <Button formAction={upAction} variant="outline" loading={upPending} loadingLabel="Creating" disabled={pending}>
            Create an account
          </Button>
        </div>
      </form>

      <Callout label="why an account?" className="mt-5">
        The trade journal is moving into a database so entries belong to a
        person rather than to a file on the server. An account is what makes an
        entry yours: the database itself refuses to hand your rows to anyone
        else, and the tools on the rest of the site stay open to everyone.
      </Callout>
    </Card>
  );
}
