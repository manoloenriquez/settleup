import { supabase } from "@/lib/supabase/client";
import type { Json } from "@template/supabase";
import type { OutboxEntry, OutboxExecutionResult, OutboxExecutor } from "@template/shared";

// Drains replay through the browser Supabase client calling the same RPCs the
// Server Actions use — identical RLS and in-RPC authorization, but immune to
// the Server Action reference ids that rotate across deploys (a queued POST
// to a stale action id would 404 after a release). Drains only run online,
// so the client's cookie-based session refresh works normally.

const SYNC_TIMEOUT_MS = 15_000;

type RpcError = { code: string | null; message: string };

function toExecutionResult(error: RpcError | null): OutboxExecutionResult {
  if (!error) return { ok: true };
  return { ok: false, code: error.code, message: error.message };
}

/** Replays one outbox entry through the same RPCs the online path uses. */
export const outboxExecutor: OutboxExecutor = async (
  entry: OutboxEntry,
): Promise<OutboxExecutionResult> => {
  const signal = AbortSignal.timeout(SYNC_TIMEOUT_MS);
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
        // Direct RLS delete; deleting an already-deleted row affects 0 rows
        // and still succeeds, so replays are naturally idempotent.
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
        // Client PK doubles as the idempotency key: a replay hits 23505,
        // which the sync engine classifies as success.
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
        return toExecutionResult(error);
      }
      default:
        return { ok: false, code: null, message: `Unsupported offline action: ${entry.kind}` };
    }
  } catch (error) {
    return {
      ok: false,
      code: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
