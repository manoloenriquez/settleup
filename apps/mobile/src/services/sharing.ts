import { z } from "zod";
import type { ApiResponse } from "@template/shared";
import { supabase } from "@/lib/supabase";

const linkSchema = z.object({ share_enabled: z.boolean(), share_token: z.string().nullable().optional() });

export type ShareLinkState = { shareEnabled: boolean; shareToken: string | null };

/** New 256-bit group link; the previous one stops working at once. */
export async function regenerateGroupLink(groupId: string): Promise<ApiResponse<ShareLinkState>> {
  const { data, error } = await supabase.schema("settleup").rpc("rotate_group_share_token", { p_group_id: groupId });
  if (error) return { data: null, error: error.message };
  const parsed = linkSchema.safeParse(data);
  if (!parsed.success) return { data: null, error: "The new link could not be read." };
  return { data: { shareEnabled: parsed.data.share_enabled, shareToken: parsed.data.share_token ?? null }, error: null };
}

/** Turning the link off kills it; turning it on issues a brand-new one. */
export async function setGroupLinkEnabled(groupId: string, enabled: boolean): Promise<ApiResponse<ShareLinkState>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("set_group_share_enabled", { p_group_id: groupId, p_enabled: enabled });
  if (error) return { data: null, error: error.message };
  const parsed = linkSchema.safeParse(data);
  if (!parsed.success) return { data: null, error: "The link setting could not be read." };
  return { data: { shareEnabled: parsed.data.share_enabled, shareToken: parsed.data.share_token ?? null }, error: null };
}

/** Hide my own payment details on this group's shared pages. */
export async function setHideMyPaymentDetails(groupId: string, hidden: boolean): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .rpc("set_hide_payment_details", { p_group_id: groupId, p_hidden: hidden });
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export type MemberPaymentDetails = {
  member_id: string;
  payer_display_name: string | null;
  gcash_name: string | null;
  gcash_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  notes: string | null;
  show_on_shared_links: boolean;
  share_full_numbers: boolean;
};

/** Details an organizer entered for a member without an account (null if none). */
export async function getMemberPaymentDetails(memberId: string): Promise<ApiResponse<MemberPaymentDetails | null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("member_payment_details")
    .select(
      "member_id, payer_display_name, gcash_name, gcash_number, bank_name, bank_account_name, bank_account_number, notes, show_on_shared_links, share_full_numbers",
    )
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as MemberPaymentDetails | null, error: null };
}

export async function saveMemberPaymentDetails(
  memberId: string,
  details: Omit<MemberPaymentDetails, "member_id">,
): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .rpc("upsert_member_payment_details", { p_member_id: memberId, p_details: details });
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function deleteMemberPaymentDetails(memberId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .rpc("delete_member_payment_details", { p_member_id: memberId });
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
