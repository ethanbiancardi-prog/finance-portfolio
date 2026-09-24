"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Set or change the display name stored on the Supabase account
// (user_metadata.full_name, the same place sign-up puts it).
export async function updateName(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return;
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { full_name: name } });
  revalidatePath("/dashboard");
}
