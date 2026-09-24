"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server Actions, so the password is posted straight to the server and never
// sits in client-side state.

type State = { error: string | null };

function readForm(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? "/dashboard"),
  };
}

export async function signIn(_prev: State, formData: FormData): Promise<State> {
  const { email, password, next } = readForm(formData);
  if (!email || !password) return { error: "Email and password are both required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Deliberately vague: saying "no account with that email" would let anyone
  // check which email addresses are registered.
  if (error) return { error: "That email and password don't match an account." };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(_prev: State, formData: FormData): Promise<State> {
  const { email, password, next } = readForm(formData);
  if (!email || !password) return { error: "Email and password are both required." };
  if (password.length < 8) return { error: "Password needs to be at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // With email confirmation switched on in Supabase, the user exists but has
  // no session until they click the link in their inbox.
  if (!data.session) {
    return { error: "Check your email for a confirmation link, then sign in." };
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
