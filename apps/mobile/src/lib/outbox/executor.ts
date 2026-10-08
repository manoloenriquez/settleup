import type { CurrencyCode } from "@template/shared";
import type { Database, SupabaseClient } from "@template/supabase";
import type { Json } from "@template/supabase";
import type { OutboxEntry, OutboxExecutionResult, OutboxExecutor } from "@template/shared";

// Sync traffic gets an explicit timeout so a hung request surfaces as a
// retryable failure instead of blocking the drain forever. Manual
// AbortController because Hermes lacks AbortSignal.timeout().
const SYNC_TIMEOUT_MS = 15_000;

function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

type RpcError = { code: string | null; message: string };

function toExecutionResult(error: RpcError | null): OutboxExecutionResult {
  if (!error) return { ok: true };
  return { ok: false, code: error.code, message: error.message };
}

/**
 * Replays one outbox entry against Supabase. Every call is idempotent:
 * creates/payments carry a client-generated id the RPCs recognize, deletes
 * treat 0 affected rows as success. A comment replay is accepted only after
 * an authorized read confirms the saved identity and complete payload.
 */
export function createOutboxExecutor(supabase: SupabaseClient<Database>): OutboxExecutor {
  return async (entry: OutboxEntry): Promise<OutboxExecutionResult> => {
    const { signal, cancel } = timeoutSignal(SYNC_TIMEOUT_MS);
    try {
      switch (entry.kind) {
        case "expense.create": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("create_expense", { p_input: entry.payload as Json })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "expense.create_itemized": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("create_itemized_expense", { p_input: entry.payload as Json })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "expense.update": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("update_expense", { p_input: entry.payload as Json })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "expense.update_itemized": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("update_itemized_expense", { p_input: entry.payload as Json })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "expense.delete": {
          // Direct RLS-governed delete; deleting an already-deleted row affects
          // 0 rows and succeeds — naturally idempotent.
          const { error } = await supabase
            .schema("settleup")
            .from("expenses")
            .delete()
            .eq("id", entry.entityId)
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "payment.record": {
          const payload = entry.payload as {
            group_id: string;
            from_member_id: string;
            to_member_id: string;
            amount_cents: number;
            currency_code?: CurrencyCode;
          };
          const { error } = await supabase
            .schema("settleup")
            .rpc("record_payment_v2", {
              p_group_id: payload.group_id,
              p_from_member_id: payload.from_member_id,
              p_to_member_id: payload.to_member_id,
              p_amount_cents: payload.amount_cents,
              p_id: entry.entityId,
              // Entries queued before currencies existed were pesos.
              p_currency_code: payload.currency_code ?? "PHP",
            })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "comment.create": {
          const payload = entry.payload as {
            expense_id: string;
            author_user_id: string;
            body: string;
          };
          const { error } = await supabase
            .schema("settleup")
            .from("expense_comments")
            .insert({ id: entry.entityId, ...payload })
            .abortSignal(signal);
          if (error?.code === "23505") {
            const { data: saved, error: readError } = await supabase
              .schema("settleup")
              .from("expense_comments")
              .select("expense_id, author_user_id, body")
              .eq("id", entry.entityId)
              .abortSignal(signal)
              .maybeSingle();
            if (readError) return toExecutionResult(readError);
            if (
              saved &&
              saved.expense_id === payload.expense_id &&
              saved.author_user_id === payload.author_user_id &&
              saved.body === payload.body
            ) {
              return { ok: true };
            }
            return {
              ok: false,
              code: "PT409",
              message:
                "This comment ID belongs to a different or inaccessible record. Your draft has been kept.",
            };
          }
          return toExecutionResult(error);
        }
        case "group.create": {
          const payload = entry.payload as { name: string; currency_code?: CurrencyCode; display_name?: string };
          // Entries queued by older builds carry only a name: keep the old RPC
          // (PHP group, profile name) so they replay exactly as intended.
          const { error } =
            payload.currency_code && payload.display_name
              ? await supabase
                  .schema("settleup")
                  .rpc("create_group_v2", {
                    p_name: payload.name,
                    p_id: entry.entityId,
                    p_currency_code: payload.currency_code,
                    p_display_name: payload.display_name,
                  })
                  .abortSignal(signal)
              : await supabase
                  .schema("settleup")
                  .rpc("create_group_with_owner", { p_name: payload.name, p_id: entry.entityId })
                  .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "category.create": {
          const payload = entry.payload as { name: string; icon: string; color: string };
          const { error } = await supabase
            .schema("settleup")
            .rpc("create_expense_category", {
              p_group_id: entry.groupId,
              p_name: payload.name,
              p_icon: payload.icon,
              p_color: payload.color,
              p_id: entry.entityId,
            })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "category.update": {
          const payload = entry.payload as {
            name: string;
            icon: string;
            color: string;
            sort_order?: number | null;
            expected_updated_at?: string;
          };
          const { error } = await supabase
            .schema("settleup")
            .rpc("update_expense_category", {
              p_category_id: entry.entityId,
              p_name: payload.name,
              p_icon: payload.icon,
              p_color: payload.color,
              p_sort_order: payload.sort_order ?? null,
              p_expected_updated_at: payload.expected_updated_at ?? null,
            })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "category.delete": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("delete_expense_category", { p_category_id: entry.entityId })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "payment.confirm": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("confirm_payment", { p_payment_id: entry.entityId })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
        case "payment.reject": {
          const { error } = await supabase
            .schema("settleup")
            .rpc("reject_payment", { p_payment_id: entry.entityId })
            .abortSignal(signal);
          return toExecutionResult(error);
        }
      }
    } catch (error) {
      return {
        ok: false,
        code: null,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      cancel();
    }
  };
}
