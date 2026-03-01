"use server";

import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { computeInsights, generateInsightsSummary } from "@/lib/ai/insights";
import type { ApiResponse } from "@template/shared/types";
import type { InsightsSummary } from "@template/shared/types";
import { z } from "zod";

export async function getGroupInsights(
  groupId: unknown,
): Promise<ApiResponse<InsightsSummary>> {
  try {
    const user = await assertAuth();

    const parsed = z.string().uuid().safeParse(groupId);
    if (!parsed.success) {
      return { data: null, error: "Invalid group ID" };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Fetch group name
    const { data: group } = await db
      .from("groups")
      .select("name")
      .eq("id", parsed.data)
      .single();

    if (!group) {
      return { data: null, error: "Group not found" };
    }

    // Fetch expenses with payers
    const { data: expenses } = await db
      .from("expenses")
      .select("item_name, amount_cents, created_at, expense_payers(member_id)")
      .eq("group_id", parsed.data)
      .order("created_at", { ascending: true });

    // Fetch members
    const { data: members } = await db
      .from("group_members")
      .select("id, display_name")
      .eq("group_id", parsed.data);

    const memberMap = new Map((members ?? []).map((m) => [m.id, m.display_name]));

    const expenseData = (expenses ?? []).map((e) => ({
      item_name: e.item_name,
      amount_cents: e.amount_cents,
      created_at: e.created_at,
      payer_names: (e.expense_payers ?? []).map((p) => memberMap.get(p.member_id) ?? "Unknown"),
    }));

    // Fetch balance data
    const { data: balances } = await db.rpc("get_member_balances", {
      p_group_id: parsed.data,
    });

    const balanceRows = (balances ?? []) as unknown as { display_name: string; net_cents: number }[];
    const memberData = balanceRows.map((b) => ({
      display_name: b.display_name,
      net_cents: b.net_cents,
    }));

    const insights = computeInsights(expenseData, memberData);

    // Optional LLM summary
    const llmSummary = await generateInsightsSummary(insights, group.name, user.id);

    return {
      data: { ...insights, llm_summary: llmSummary },
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
