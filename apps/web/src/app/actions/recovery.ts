"use server";

import {
  emailSchema,
  safeReturnPath,
  updatePasswordSchema,
  type ApiResponse,
} from "@template/shared";
import { createClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-url";
import { assertAuth, AuthError } from "@/lib/supabase/guards";

export async function updatePassword(input: unknown): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const parsed = updatePasswordSchema.safeParse(input);
    if (!parsed.success)
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid password." };
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    if (error) return { data: null, error: error.message };
    await client.auth.signOut();
    return { data: undefined, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof AuthError
          ? "This link has expired. Request a new reset email."
          : "Could not update password. Please try again.",
    };
  }
}

export async function resendConfirmation(
  email: string,
  destination: string,
): Promise<ApiResponse<void>> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { data: null, error: "Enter a valid email." };
  try {
    const client = await createClient();
    const { error } = await client.auth.resend({
      type: "signup",
      email: parsed.data,
      options: {
        emailRedirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(safeReturnPath(destination))}`,
      },
    });
    if (error)
      return {
        data: null,
        error: "Unable to resend right now. Please wait a minute and try again.",
      };
    return { data: undefined, error: null };
  } catch {
    return { data: null, error: "Could not send email. Please try again." };
  }
}
