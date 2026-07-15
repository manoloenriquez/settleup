import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "@/lib/supabase";
import { buildGroupLedgerCsv } from "@template/shared";
import type { ApiResponse, LedgerExpense, LedgerPayment } from "@template/shared";

/**
 * Builds the group's CSV ledger and opens the system share sheet.
 */
export async function shareGroupLedger(groupId: string, groupName: string): Promise<ApiResponse<null>> {
  const db = supabase.schema("settleup");

  const [membersRes, expensesRes, paymentsRes] = await Promise.all([
    db.from("group_members").select("id, display_name").eq("group_id", groupId),
    db
      .from("expenses")
      .select("item_name, amount_cents, notes, created_at, expense_date, category:expense_categories(name), payers:expense_payers(member_id), participants:expense_participants(member_id)")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: true })
      .order("created_at", { ascending: true }),
    db
      .from("payments")
      .select("from_member_id, to_member_id, amount_cents, status, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true }),
  ]);

  if (membersRes.error || expensesRes.error || paymentsRes.error) {
    return { data: null, error: "Failed to load group data for export." };
  }

  const nameById = new Map((membersRes.data ?? []).map((m) => [m.id, m.display_name]));
  const name = (id: string): string => nameById.get(id) ?? "Unknown";

  const expenses: LedgerExpense[] = (expensesRes.data ?? []).map((e) => ({
    item_name: e.item_name,
    amount_cents: e.amount_cents,
    created_at: e.created_at,
    expense_date: e.expense_date,
    payer_names: (e.payers ?? []).map((p) => name(p.member_id)),
    participant_names: (e.participants ?? []).map((p) => name(p.member_id)),
    category_name: (e.category as { name: string } | null)?.name ?? null,
    notes: e.notes,
  }));

  const payments: LedgerPayment[] = (paymentsRes.data ?? []).map((p) => ({
    from_name: name(p.from_member_id),
    to_name: name(p.to_member_id),
    amount_cents: p.amount_cents,
    created_at: p.created_at,
    status: p.status,
  }));

  const csv = buildGroupLedgerCsv(expenses, payments);
  const fileName = `${groupName.replace(/[^\w\d-]+/g, "-").toLowerCase()}-ledger.csv`;

  try {
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();
    file.write(csv);

    if (!(await Sharing.isAvailableAsync())) {
      return { data: null, error: "Sharing isn't available on this device." };
    }
    await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: `${groupName} ledger` });
    return { data: null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Failed to export ledger." };
  }
}
