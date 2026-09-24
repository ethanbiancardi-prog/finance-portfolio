"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// One Server Action for both buttons, so the password is posted straight to
// the server and never sits in client state.
//
// Which button was clicked arrives as `intent` in the form data — a submit
// button's name/value is included in the submission. One action means one
// piece of state, so a failed sign-in can never leave an error on screen
// that outlives the sign-up attempt after it.

export type State = { error: string | null; notice: string | null };

export const initialState: State = { error: null, notice: null };

export async function authenticate(_prev: State, formData: FormData): Promise<State> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  const intent = String(formData.get("intent") ?? "signin");

  if (!email || !password) return { error: "Email and password are both required.", notice: null };

  const supabase = await createClient();

  if (intent === "signup") {
    if (password.length < 8) {
      return { error: "Password needs to be at least 8 characters.", notice: null };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message, notice: null };

    // With email confirmation on in Supabase, the account exists but has no
    // session until the link in the inbox is clicked.
    if (!data.session) {
      return {
        error: null,
        notice: "Account created. Check your email for a confirmation link, then sign in.",
      };
    }
    revalidatePath("/", "layout");
    redirect(next);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Deliberately vague about which half was wrong: a precise message would
    // let anyone check which email addresses are registered.
    return {
      error: "That email and password don't match an account. If you don't have one yet, use Create an account.",
      notice: null,
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
