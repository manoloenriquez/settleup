import type { PostgrestError } from "@supabase/supabase-js";
import {
  budgetDocumentSchema,
  isCurrencyCode,
  type ApiResponse,
  type BudgetDocument,
  type GroupShareRow,
} from "@template/shared";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// The budget's two server reads/writes: the account's budget document
// (settleup.personal_budgets, saved only through save_personal_budget) and
// the person's own shares of group expenses (read under RLS, like the group
// screens do).
// ---------------------------------------------------------------------------

/** Sync isn't available on this server yet (migration not applied). Anything else is a real failure. */
export class BudgetSyncUnavailable extends Error {
  constructor() {
    super("Budget backup isn't available yet. Your budget is saved on this iPhone.");
  }
}

const MISSING = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

/** Only "this table/function doesn't exist" means the server isn't ready; auth, permission and network errors are real failures. */
export function isMissingBudgetBackend(error: Pick<PostgrestError, "code"> | null): boolean {
  return !!error && MISSING.has(error.code);
}

export type RemoteBudget = { doc: BudgetDocument; updatedAt: string } | null;

export async function fetchRemoteBudget(): Promise<RemoteBudget> {
  const { data, error } = await supabase.schema("settleup").from("personal_budgets").select("doc, updated_at").maybeSingle();
  if (isMissingBudgetBackend(error)) throw new BudgetSyncUnavailable();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const parsed = budgetDocumentSchema.safeParse(data.doc);
  if (!parsed.success) throw new Error("The budget saved in your account could not be read by this version of Talli.");
  return { doc: parsed.data, updatedAt: data.updated_at };
}

export type SaveBudgetResult =
  | { status: "saved"; updatedAt: string }
  | { status: "conflict"; doc: BudgetDocument; updatedAt: string };

export async function saveRemoteBudget(doc: BudgetDocument, baseUpdatedAt: string | null): Promise<SaveBudgetResult> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("save_personal_budget", { p_doc: doc, p_base_updated_at: baseUpdatedAt });
  if (isMissingBudgetBackend(error)) throw new BudgetSyncUnavailable();
  if (error) throw new Error(error.message);
  const result = data as { status?: string; updated_at?: string; doc?: unknown } | null;
  if (result?.status === "saved" && typeof result.updated_at === "string") {
    return { status: "saved", updatedAt: result.updated_at };
  }
  if (result?.status === "conflict" && typeof result.updated_at === "string") {
    const parsed = budgetDocumentSchema.safeParse(result.doc);
    if (!parsed.success) throw new Error("The budget saved in your account could not be read by this version of Talli.");
    return { status: "conflict", doc: parsed.data, updatedAt: result.updated_at };
  }
  throw new Error("Unexpected reply when saving the budget.");
}

// ---------------------------------------------------------------------------
// Group shares
// ---------------------------------------------------------------------------

const PAGE = 1000;
/** Enough for years of a person's shared expenses; past it the budget says figures may be incomplete. */
const MAX_PAGES = 20;

export type GroupShares = { rows: GroupShareRow[]; myMemberIds: string[]; complete: boolean };

type ParticipantRow = {
  member_id: string;
  share_cents: number;
  expense: {
    id: string;
    item_name: string;
    amount_cents: number;
    currency_code: string;
    expense_date: string | null;
    created_at: string;
    group_id: string;
    category: { slug: string; name: string } | null;
  } | null;
};

export async function fetchGroupShares(userId: string, from: string): Promise<ApiResponse<GroupShares>> {
  const members = await supabase
    .schema("settleup")
    .from("group_members")
    .select("id, group_id, group:groups(name)")
    .eq("user_id", userId);
  if (members.error) return { data: null, error: members.error.message };
  const memberRows = (members.data ?? []) as unknown as { id: string; group_id: string; group: { name: string } | null }[];
  const myMemberIds = memberRows.map((m) => m.id);
  if (myMemberIds.length === 0) return { data: { rows: [], myMemberIds, complete: true }, error: null };
  const groupNames = new Map(memberRows.map((m) => [m.group_id, m.group?.name ?? "Group"]));

  const byExpense = new Map<string, GroupShareRow>();
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .schema("settleup")
      .from("expense_participants")
      .select(
        "member_id, share_cents, expense:expenses!inner(id, item_name, amount_cents, currency_code, expense_date, created_at, group_id, category:expense_categories(slug, name))",
      )
      .in("member_id", myMemberIds)
      .gte("expense.expense_date", from)
      .order("expense_id")
      .order("member_id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { data: null, error: error.message };
    const rows = (data ?? []) as unknown as ParticipantRow[];
    for (const row of rows) {
      const e = row.expense;
      if (!e || !isCurrencyCode(e.currency_code)) continue;
      const existing = byExpense.get(e.id);
      const share = { memberId: row.member_id, shareMinor: row.share_cents };
      if (existing) {
        existing.shares.push(share);
        continue;
      }
      byExpense.set(e.id, {
        expenseId: e.id,
        groupName: groupNames.get(e.group_id) ?? "Group",
        description: e.item_name,
        currency: e.currency_code,
        date: e.expense_date ?? e.created_at.slice(0, 10),
        totalMinor: e.amount_cents,
        categorySlug: e.category?.slug ?? null,
        categoryName: e.category?.name ?? null,
        shares: [share],
      });
    }
    if (rows.length < PAGE) {
      complete = true;
      break;
    }
  }
  return { data: { rows: [...byExpense.values()], myMemberIds, complete }, error: null };
}
