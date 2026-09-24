"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Callout, Card, Field } from "@/components/ui";
import { authenticate, type State } from "./actions";

const initialState: State = { error: null, notice: null };

export default function LoginForm() {
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [state, action, pending] = useActionState(authenticate, initialState);

  return (
    <Card as="section" className="mt-4 max-w-md">
      {/* One form, two submit buttons: the same email and password either
          signs you in or creates the account, so nobody has to choose a mode
          before typing anything. The clicked button's name/value tells the
          action which one was meant. Enter submits as Sign in, since that is
          what someone with an account will do most often. */}
      <form action={action} className="space-y-4">
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

        {state.error && (
          <p className="text-xs leading-5 text-bad" role="alert">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p className="text-xs leading-5 text-good" role="status">
            {state.notice}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button name="intent" value="signin" loading={pending} loadingLabel="Working">
            Sign in
          </Button>
          <Button name="intent" value="signup" variant="outline" disabled={pending}>
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
