"use server";

import { z } from "zod";
import type { ApiResponse } from "@template/shared";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createSettleUpDb } from "@/lib/supabase/settleup";

const acceptSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, "This invite link is not valid."),
  displayName: z.string().trim().min(1, "Enter the name your friend will see.").max(80),
});

/** Accept a friend's invite link; returns the shared two-person ledger. */
export async function acceptFriendInvite(
  token: string,
  displayName: string,
): Promise<ApiResponse<{ groupId: string }>> {
  try {
    const parsed = acceptSchema.safeParse({ token, displayName });
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("accept_friend_invite", { p_token: parsed.data.token, p_display_name: parsed.data.displayName });
    if (error) return { data: null, error: error.message };
    const result = z.object({ direct_group_id: z.string().uuid() }).safeParse(data);
    if (!result.success) return { data: null, error: "The invite could not be accepted." };
    return { data: { groupId: result.data.direct_group_id }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong. Try again." };
  }
}
