"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema, safeReturnPath } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import { appOrigin } from "@/lib/app-url";

export async function signIn(_: unknown, formData: FormData): Promise<ApiResponse<void>> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { data: null, error: error.message };

  const destination = safeReturnPath(formData.get("redirectTo"));

  redirect(destination);
}

export async function signUp(_: unknown, formData: FormData): Promise<ApiResponse<void>> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const destination = safeReturnPath(formData.get("redirectTo"));
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(destination)}`,
    },
  });

  if (error) return { data: null, error: error.message };

  // Email confirmations disabled (local dev) — session is created immediately
  if (data.session) redirect(destination);

  // Email confirmation required — tell the form to show success state
  return { data: undefined, error: null };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
