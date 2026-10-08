import { z } from "zod";
import { currencyCodeSchema, type ApiResponse, type CurrencyCode } from "@template/shared";
import { supabase } from "@/lib/supabase";

const friendSchema = z.object({
  friend_user_id: z.string(),
  display_name: z.string(),
  direct_group_id: z.string(),
  default_currency_code: currencyCodeSchema,
  since: z.string(),
});
export type Friend = z.infer<typeof friendSchema>;

const previewSchema = z.object({
  status: z.enum(["open", "used", "expired", "invalid"]),
  inviter_name: z.string().optional(),
  currency_code: currencyCodeSchema.optional(),
});
export type FriendInvitePreview = z.infer<typeof previewSchema>;

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

/** The link a friend opens: the web page when configured, else the app link. */
export function friendInviteUrl(token: string): string {
  return WEB_ORIGIN ? `${WEB_ORIGIN}/f/${token}` : `talli://friend?token=${token}`;
}

export async function listFriends(): Promise<ApiResponse<Friend[]>> {
  const { data, error } = await supabase.schema("settleup").rpc("list_friends");
  if (error) return { data: null, error: error.message };
  const parsed = z.array(friendSchema).safeParse(data);
  if (!parsed.success) return { data: null, error: "Your friends list could not be read." };
  return { data: parsed.data, error: null };
}

export async function createFriendInvite(
  displayName: string,
  currency: CurrencyCode,
): Promise<ApiResponse<{ token: string; url: string }>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("create_friend_invite", { p_display_name: displayName.trim(), p_currency_code: currency });
  if (error) return { data: null, error: error.message };
  const parsed = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(data);
  if (!parsed.success) return { data: null, error: "The invite could not be created." };
  return { data: { token: parsed.data.token, url: friendInviteUrl(parsed.data.token) }, error: null };
}

export async function previewFriendInvite(token: string): Promise<ApiResponse<FriendInvitePreview>> {
  const { data, error } = await supabase.schema("settleup").rpc("get_friend_invite_preview", { p_token: token });
  if (error) return { data: null, error: error.message };
  const parsed = previewSchema.safeParse(data);
  if (!parsed.success) return { data: null, error: "This invite could not be read." };
  return { data: parsed.data, error: null };
}

export async function acceptFriendInvite(
  token: string,
  displayName: string,
): Promise<ApiResponse<{ directGroupId: string }>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("accept_friend_invite", { p_token: token, p_display_name: displayName.trim() });
  if (error) return { data: null, error: error.message };
  const parsed = z.object({ direct_group_id: z.string() }).safeParse(data);
  if (!parsed.success) return { data: null, error: "The invite could not be accepted." };
  return { data: { directGroupId: parsed.data.direct_group_id }, error: null };
}

export async function removeFriend(friendUserId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase.schema("settleup").rpc("remove_friend", { p_friend_user_id: friendUserId });
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
