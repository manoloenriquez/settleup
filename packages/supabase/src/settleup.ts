import type { ApiResponse, GroupWithStats } from "@template/shared";
import type { Expense, Group, GroupMember, Json } from "./database.types";
import { z } from "zod";

type EqualExpenseRpcInput = {
  groupId: string;
  itemName: string;
  amountCents: number;
  notes?: string;
  participantIds: string[];
  payers: Array<{ memberId: string; paidCents: number }>;
};

type CustomExpenseRpcInput = {
  groupId: string;
  itemName: string;
  amountCents: number;
  notes?: string;
  customSplits: Array<{ memberId: string; shareCents: number }>;
  payers: Array<{ memberId: string; paidCents: number }>;
};

type ItemizedExpenseRpcInput = {
  groupId: string;
  itemName: string;
  amountCents: number;
  notes?: string;
  payers: Array<{ memberId: string; paidCents: number }>;
  lineItems: Array<{ name: string; amountCents: number; participantIds: string[] }>;
};

const groupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner_user_id: z.string().uuid().nullable(),
  invite_code: z.string(),
  is_archived: z.boolean(),
  share_token: z.string(),
  created_at: z.string(),
});

const groupMemberSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().uuid(),
  display_name: z.string(),
  slug: z.string(),
  share_token: z.string(),
  user_id: z.string().uuid().nullable(),
  role: z.enum(["owner", "member"]),
  created_at: z.string(),
});

const expenseSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().uuid(),
  item_name: z.string(),
  amount_cents: z.number().int(),
  notes: z.string().nullable(),
  created_by_user_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

const groupWithStatsSchema = groupSchema.extend({
  member_count: z.number().int(),
  pending_count: z.number().int(),
  total_owed_cents: z.number().int(),
});

const createGroupResultSchema = z.object({ group: groupSchema });
const createExpenseResultSchema = z.object({ expense: expenseSchema });
const groupsWithStatsResultSchema = z.array(groupWithStatsSchema);
const joinGroupResultSchema = z.object({
  group: groupSchema,
  member: groupMemberSchema,
  error: z.string().optional(),
});
const claimMemberResultSchema = z.object({
  member: groupMemberSchema,
  error: z.string().optional(),
});
const shareTokenResultSchema = z.object({ share_token: z.string() });
const inviteCodeResultSchema = z.object({ invite_code: z.string() });

function parseRpcPayload<T>(
  result: Json | null,
  schema: z.ZodType<T>,
  fallbackError: string,
): ApiResponse<T> {
  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    return { data: null, error: fallbackError };
  }

  return { data: parsed.data, error: null };
}

export function buildEqualExpenseRpcInput(input: EqualExpenseRpcInput): Json {
  return {
    group_id: input.groupId,
    item_name: input.itemName.trim(),
    amount_cents: input.amountCents,
    notes: input.notes?.trim() || undefined,
    split_mode: "equal",
    participant_ids: [...input.participantIds].sort(),
    payers: input.payers.map((payer) => ({
      member_id: payer.memberId,
      paid_cents: payer.paidCents,
    })),
  };
}

export function buildCustomExpenseRpcInput(input: CustomExpenseRpcInput): Json {
  return {
    group_id: input.groupId,
    item_name: input.itemName.trim(),
    amount_cents: input.amountCents,
    notes: input.notes?.trim() || undefined,
    split_mode: "custom",
    custom_splits: input.customSplits.map((split) => ({
      member_id: split.memberId,
      share_cents: split.shareCents,
    })),
    payers: input.payers.map((payer) => ({
      member_id: payer.memberId,
      paid_cents: payer.paidCents,
    })),
  };
}

export function buildItemizedExpenseRpcInput(input: ItemizedExpenseRpcInput): Json {
  return {
    group_id: input.groupId,
    item_name: input.itemName.trim(),
    amount_cents: input.amountCents,
    notes: input.notes?.trim() || undefined,
    payers: input.payers.map((payer) => ({
      member_id: payer.memberId,
      paid_cents: payer.paidCents,
    })),
    line_items: input.lineItems.map((lineItem) => ({
      name: lineItem.name.trim(),
      amount_cents: lineItem.amountCents,
      participant_ids: [...lineItem.participantIds].sort(),
    })),
  };
}

export function parseCreateGroupRpcResult(result: Json | null): ApiResponse<Group> {
  const parsed = parseRpcPayload(result, createGroupResultSchema, "Failed to create group.");
  if (parsed.error) return parsed;
  if (parsed.data === null) return { data: null, error: "Failed to create group." };

  return { data: parsed.data.group, error: null };
}

export function parseCreateExpenseRpcResult(result: Json | null): ApiResponse<Expense> {
  const parsed = parseRpcPayload(result, createExpenseResultSchema, "Failed to parse expense.");
  if (parsed.error) return parsed;
  if (parsed.data === null) return { data: null, error: "Failed to parse expense." };

  return { data: parsed.data.expense, error: null };
}

export function parseGroupsWithStatsRpcResult(result: Json | null): ApiResponse<GroupWithStats[]> {
  return parseRpcPayload(result, groupsWithStatsResultSchema, "Failed to parse groups.");
}

export function parseJoinGroupRpcResult(
  result: Json | null,
): ApiResponse<{ group: Group; member: GroupMember }> {
  const parsed = parseRpcPayload(result, joinGroupResultSchema, "Failed to join group.");
  if (parsed.error) return parsed;
  if (parsed.data === null) return { data: null, error: "Failed to join group." };
  if (parsed.data.error) return { data: null, error: parsed.data.error };

  return {
    data: { group: parsed.data.group, member: parsed.data.member },
    error: null,
  };
}

export function parseClaimMemberRpcResult(
  result: Json | null,
): ApiResponse<{ member: GroupMember }> {
  const parsed = parseRpcPayload(result, claimMemberResultSchema, "Failed to claim member.");
  if (parsed.error) return parsed;
  if (parsed.data === null) return { data: null, error: "Failed to claim member." };
  if (parsed.data.error) return { data: null, error: parsed.data.error };

  return { data: { member: parsed.data.member }, error: null };
}

export function parseShareTokenRpcResult(result: Json | null): ApiResponse<{ share_token: string }> {
  return parseRpcPayload(result, shareTokenResultSchema, "Failed to rotate share token.");
}

export function parseInviteCodeRpcResult(result: Json | null): ApiResponse<{ invite_code: string }> {
  return parseRpcPayload(result, inviteCodeResultSchema, "Failed to regenerate invite code.");
}
