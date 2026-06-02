"use server";

import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { computeInsights, generateInsightsSummary } from "@template/ai";
import { checkRateLimit } from "@/lib/ai/rate-limit";
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
    const { data: group, error: groupError } = await db
      .from("groups")
      .select("name")
      .eq("id", parsed.data)
      .single();

    if (groupError) {
      return { data: null, error: "Failed to load group." };
    }

    if (!group) {
      return { data: null, error: "Group not found" };
    }

    // Fetch expenses with payers
    const { data: expenses, error: expensesError } = await db
      .from("expenses")
      .select("item_name, amount_cents, created_at, category:expense_categories(id, name, slug, icon, color), expense_payers(member_id)")
      .eq("group_id", parsed.data)
      .order("created_at", { ascending: true });

    // Fetch members
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("id, display_name")
      .eq("group_id", parsed.data);

    if (expensesError || membersError) {
      return { data: null, error: "Failed to load insights." };
    }

    const memberMap = new Map((members ?? []).map((m) => [m.id, m.display_name]));

    const expenseData = (expenses ?? []).map((e) => ({
      item_name: e.item_name,
      amount_cents: e.amount_cents,
      created_at: e.created_at,
      payer_names: (e.expense_payers ?? []).map((p) => memberMap.get(p.member_id) ?? "Unknown"),
      category: e.category,
    }));

    const insights = computeInsights(expenseData);

    // Optional LLM summary — only call the rate limiter if we're actually going to invoke the LLM
    const rate = await checkRateLimit(user.id);
    const llmSummary = rate.allowed
      ? await generateInsightsSummary(insights, group.name)
      : null;

    return {
      data: { ...insights, llm_summary: llmSummary },
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
