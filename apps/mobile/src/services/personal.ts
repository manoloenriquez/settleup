import { z } from "zod";
import {
  pushResultSchema,
  serverPersonalExpenseSchema,
  type ApiResponse,
  type PushResult,
  type PushRow,
  type ServerPersonalExpense,
} from "@template/shared";
import { supabase } from "@/lib/supabase";

const COLUMNS =
  "id, description, amount_minor, currency_code, category_slug, expense_date, notes, merchant, source, client_created_at, client_updated_at, deleted_at, updated_at";

/** Re-read a short window before the cursor: a slow transaction can commit after a later one. */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;
const PAGE_SIZE = 500;

export async function pushPersonalExpenses(rows: PushRow[]): Promise<ApiResponse<PushResult[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("upsert_personal_expenses", { p_rows: rows });
  if (error) return { data: null, error: error.message };
  const parsed = z.array(pushResultSchema).safeParse(data);
  if (!parsed.success) return { data: null, error: "The server sent an unexpected sync response." };
  return { data: parsed.data, error: null };
}

/** Every row (including deletions) changed since `since`, oldest first. */
export async function pullPersonalExpenses(
  since: string | null,
): Promise<ApiResponse<ServerPersonalExpense[]>> {
  const from = since ? new Date(new Date(since).getTime() - CURSOR_OVERLAP_MS).toISOString() : null;
  const rows: ServerPersonalExpense[] = [];
  // Keyset paging on (updated_at, id): a row that changes while we page moves
  // to the end instead of shifting later rows past an offset.
  let after: { updatedAt: string; id: string } | null = null;
  for (let page = 0; page < 200; page++) {
    let query = supabase
      .schema("settleup")
      .from("personal_expenses")
      .select(COLUMNS)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (after) {
      query = query.or(
        // Quoted: timestamps contain ":" and "+", which PostgREST reserves.
        `updated_at.gt."${after.updatedAt}",and(updated_at.eq."${after.updatedAt}",id.gt."${after.id}")`,
      );
    } else if (from) {
      query = query.gte("updated_at", from);
    }
    const { data, error } = await query;
    if (error) return { data: null, error: error.message };
    const parsed = z.array(serverPersonalExpenseSchema).safeParse(data);
    if (!parsed.success) return { data: null, error: "The server sent expenses Talli couldn’t read." };
    rows.push(...parsed.data);
    const last = parsed.data[parsed.data.length - 1];
    if (parsed.data.length < PAGE_SIZE || !last) break;
    after = { updatedAt: last.updated_at, id: last.id };
  }
  return { data: rows, error: null };
}
