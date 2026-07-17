import { supabase } from "@/lib/supabase";
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
 * treat 0 affected rows as success, comment replays surface 23505 which the
 * engine classifies as already-applied.
 */
export const outboxExecutor: OutboxExecutor = async (
  entry: OutboxEntry,
): Promise<OutboxExecutionResult> => {
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
        };
        const { error } = await supabase
          .schema("settleup")
          .rpc("record_payment", {
            p_group_id: payload.group_id,
            p_from_member_id: payload.from_member_id,
            p_to_member_id: payload.to_member_id,
            p_amount_cents: payload.amount_cents,
            p_id: entry.entityId,
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
        // Client-supplied PK; a replay hits the unique constraint (23505),
        // which the engine treats as success.
        const { error } = await supabase
          .schema("settleup")
          .from("expense_comments")
          .insert({ id: entry.entityId, ...payload })
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
