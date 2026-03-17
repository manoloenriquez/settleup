"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import type { ApiResponse } from "@template/shared";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email address.").toLowerCase(),
});

export async function forgotPassword(
  _: unknown,
  formData: FormData,
): Promise<ApiResponse<void>> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectTo = `${protocol}://${host}/login`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  // Always return success — don't leak whether email exists
  if (error) {
    console.error("resetPasswordForEmail error:", error.message);
  }

  return { data: undefined, error: null };
}
