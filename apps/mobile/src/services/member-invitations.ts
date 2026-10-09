import { z } from "zod";
import type { ApiResponse } from "@template/shared";
import { supabase } from "@/lib/supabase";

const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

/**
 * A personal link that connects someone's account to their existing entry
 * (single use, 7 days; replaces older links). Returns the URL to share.
 */
export async function createMemberInvitation(memberId: string): Promise<ApiResponse<string>> {
  const origin = process.env.EXPO_PUBLIC_WEB_URL;
  if (!origin) return { data: null, error: "Sharing isn’t available until the app’s web address is set up." };
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("create_member_claim_invitation", { p_member_id: memberId });
  const parsed = tokenSchema.safeParse(data);
  if (error || !parsed.success) return { data: null, error: error?.message ?? "The invitation couldn’t be created." };
  return { data: `${origin.replace(/\/$/, "")}/claim?token=${parsed.data.token}`, error: null };
}

export async function revokeMemberInvitation(memberId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .rpc("revoke_member_claim_invitation", { p_member_id: memberId });
  return error ? { data: null, error: error.message } : { data: null, error: null };
}
