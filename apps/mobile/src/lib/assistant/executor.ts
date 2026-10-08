import { onlineManager, type QueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { PersonalExpenseInput, Proposal } from "@template/shared";
import { errorClassFor, participantBucket } from "@template/shared/analytics";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import {
  addExpenseCustomSplitOrQueue,
  addExpenseOrQueue,
  deleteExpenseOrQueue,
  invalidateExpenseQueries,
  updateExpenseCustomSplitOrQueue,
  updateExpenseOrQueue,
  type EnqueueFn,
} from "@/hooks/useExpenses";
import { recordPaymentOrQueue } from "@/hooks/usePayments";
import { createGroup, renameGroup } from "@/services/groups";
import { addMembersBatch, deleteMember } from "@/services/members";

// ---------------------------------------------------------------------------
// Runs a confirmed proposal through the same functions the screens use (the
// hooks' bodies), so validation, RLS, the offline outbox and idempotency are
// identical. The result describes what actually happened — never what the
// model said.
// ---------------------------------------------------------------------------

export type ExecutionStatus = "saved" | "queued" | "failed";

export type UndoAction =
  | { type: "delete_group_expense"; groupId: string; expenseId: string }
  | { type: "remove_personal_expense"; id: string };

export type ExecutionResult = {
  status: ExecutionStatus;
  message: string;
  undo?: UndoAction;
  /** Where the result lives, for a "View" link. */
  groupId?: string;
};

export type ExecutorDeps = {
  qc: QueryClient;
  enqueue: EnqueueFn;
  userId: string | null;
  myName: string | null;
  personal: {
    add: (input: PersonalExpenseInput) => Promise<string>;
    remove: (id: string) => Promise<void>;
  };
};

function invalidateGroup(qc: QueryClient, groupId: string): void {
  invalidateExpenseQueries(qc, groupId);
  void qc.invalidateQueries({ queryKey: ["members", groupId] });
}

/** Server-side check for deletes (the delete RPC has no CAS). */
async function unchangedOnServer(expenseId: string, expectedUpdatedAt: string): Promise<string | null> {
  const { data, error } = await supabase.schema("settleup").from("expenses").select("updated_at").eq("id", expenseId).maybeSingle();
  if (error) return null; // Let the delete itself report a real failure.
  if (!data) return "That expense was already deleted.";
  return data.updated_at === expectedUpdatedAt ? null : "That expense was changed since I showed you this. Ask again to see the latest.";
}

export async function executeProposal(proposal: Proposal, deps: ExecutorDeps): Promise<ExecutionResult> {
  const a = proposal.action;
  // Each *OrQueue function decides online-vs-queue synchronously when called;
  // `queued` is read at that same moment (see call sites), never earlier.
  let queued = false;
  const now = (): void => {
    queued = !onlineManager.isOnline();
  };
  const done = (message: string, extra: Partial<ExecutionResult> = {}): ExecutionResult => ({
    status: queued ? "queued" : "saved",
    message: queued ? `${message.replace(/\.$/, "")} on this iPhone — it will sync when you're back online.` : message,
    ...extra,
  });
  const online = onlineManager.isOnline();
  try {
    switch (a.type) {
      case "add_personal_expense": {
        const id = await deps.personal.add({
          description: a.description,
          amountMinor: a.amountMinor,
          currency: a.currency,
          category: a.category,
          date: a.date,
          source: "chat",
        });
        return { status: "saved", message: "Saved to your expenses.", undo: { type: "remove_personal_expense", id } };
      }
      case "add_group_expense": {
        if (!deps.userId) return { status: "failed", message: "Sign in to add shared expenses." };
        const common = {
          groupId: a.groupId,
          itemName: a.description,
          amountCents: a.amountMinor,
          currencyCode: a.currency,
          expenseDate: a.date,
        };
        // The proposal id is the idempotency key: a retry replays, never duplicates.
        now();
        const res =
          a.splitMode === "equal"
            ? await addExpenseOrQueue(
                { ...common, memberIds: a.shares.map((s) => s.memberId), payerMemberId: a.payerMemberId, createdByUserId: deps.userId },
                deps.enqueue,
                proposal.id,
              )
            : await addExpenseCustomSplitOrQueue(
                { ...common, customSplits: a.shares, payers: [{ memberId: a.payerMemberId, paidCents: a.amountMinor }] },
                deps.enqueue,
                proposal.id,
              );
        if (res.error) {
          track({ name: "expense_save_failed", properties: { error_class: errorClassFor(res.error) } });
          return { status: "failed", message: res.error };
        }
        track({ name: "expense_saved", properties: { entry_mode: "chat", participant_bucket: participantBucket(a.shares.length) } });
        invalidateGroup(deps.qc, a.groupId);
        return done("Expense added.", { undo: { type: "delete_group_expense", groupId: a.groupId, expenseId: proposal.id }, groupId: a.groupId });
      }
      case "edit_group_expense": {
        const common = {
          expenseId: a.expenseId,
          expectedUpdatedAt: a.expectedUpdatedAt,
          itemName: a.description,
          amountCents: a.amountMinor,
          currencyCode: a.currency,
          expenseDate: a.date,
          categoryId: a.categoryId,
          notes: a.notes ?? undefined,
          payers: a.payers.map((p) => ({ memberId: p.memberId, paidCents: p.amountMinor })),
        };
        now();
        const res =
          a.splitMode === "equal"
            ? await updateExpenseOrQueue(a.groupId, { ...common, participantIds: a.shares.map((s) => s.memberId) }, deps.enqueue)
            : await updateExpenseCustomSplitOrQueue(a.groupId, { ...common, customSplits: a.shares }, deps.enqueue);
        if (res.error) return { status: "failed", message: /PT409|modified|changed/i.test(res.error) ? "Someone changed this expense first. Ask again to see the latest." : res.error };
        invalidateGroup(deps.qc, a.groupId);
        return done("Expense updated.", { groupId: a.groupId });
      }
      case "delete_group_expense": {
        if (online) {
          const changed = await unchangedOnServer(a.expenseId, a.expectedUpdatedAt);
          if (changed) return { status: "failed", message: changed };
        }
        if (!onlineManager.isOnline()) return { status: "failed", message: "Deleting needs a connection so the latest version can be checked first." };
        const res = await deleteExpenseOrQueue(a.groupId, a.expenseId, deps.enqueue);
        if (res.error) return { status: "failed", message: res.error };
        invalidateGroup(deps.qc, a.groupId);
        return { status: "saved", message: "Expense deleted.", groupId: a.groupId };
      }
      case "record_payment": {
        now();
        const res = await recordPaymentOrQueue(
          { groupId: a.groupId, fromMemberId: a.fromMemberId, toMemberId: a.toMemberId, amountCents: a.amountMinor, currencyCode: a.currency },
          deps.enqueue,
          proposal.id,
        );
        if (res.error) return { status: "failed", message: res.error };
        void deps.qc.invalidateQueries({ queryKey: ["balances", a.groupId] });
        void deps.qc.invalidateQueries({ queryKey: ["activity", a.groupId] });
        void deps.qc.invalidateQueries({ queryKey: ["dashboard"] });
        void deps.qc.invalidateQueries({ queryKey: ["groups"] });
        return done("Payment recorded.", { groupId: a.groupId });
      }
      case "create_group": {
        if (!online) return { status: "failed", message: "Creating a group needs a connection." };
        const created = await createGroup({ id: Crypto.randomUUID(), name: a.name, currency: a.currency, displayName: deps.myName ?? "Me" });
        if (created.error || !created.data) return { status: "failed", message: created.error ?? "The group could not be created." };
        track({ name: "group_created" });
        void deps.qc.invalidateQueries({ queryKey: ["groups"] });
        void deps.qc.invalidateQueries({ queryKey: ["dashboard"] });
        if (a.memberNames.length === 0) return { status: "saved", message: `Created "${a.name}".`, groupId: created.data.id };
        const added = await addMembersBatch(created.data.id, a.memberNames);
        if (added.error) {
          return {
            status: "failed",
            message: `Created "${a.name}", but adding ${a.memberNames.join(", ")} failed: ${added.error}. Add them from the group's settings.`,
            groupId: created.data.id,
          };
        }
        for (let i = 0; i < (added.data?.length ?? 0); i++) track({ name: "member_added" });
        invalidateGroup(deps.qc, created.data.id);
        return { status: "saved", message: `Created "${a.name}" with ${a.memberNames.join(", ")}.`, groupId: created.data.id };
      }
      case "add_members": {
        if (!online) return { status: "failed", message: "Adding people needs a connection." };
        const res = await addMembersBatch(a.groupId, a.names);
        if (res.error) return { status: "failed", message: res.error };
        for (let i = 0; i < (res.data?.length ?? 0); i++) track({ name: "member_added" });
        invalidateGroup(deps.qc, a.groupId);
        return { status: "saved", message: `Added ${a.names.join(", ")}.`, groupId: a.groupId };
      }
      case "remove_member": {
        if (!online) return { status: "failed", message: "Removing someone needs a connection." };
        const res = await deleteMember(a.memberId);
        if (res.error) return { status: "failed", message: res.error };
        invalidateGroup(deps.qc, a.groupId);
        void deps.qc.invalidateQueries({ queryKey: ["dashboard"] });
        return { status: "saved", message: "Removed from the group.", groupId: a.groupId };
      }
      case "rename_group": {
        if (!online) return { status: "failed", message: "Renaming a group needs a connection." };
        const res = await renameGroup(a.groupId, a.name);
        if (res.error) return { status: "failed", message: res.error };
        void deps.qc.invalidateQueries({ queryKey: ["groups"] });
        return { status: "saved", message: `Renamed to "${a.name}".`, groupId: a.groupId };
      }
    }
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/** Reverses an assistant write where a safe inverse exists. */
export async function undoAction(undo: UndoAction, deps: ExecutorDeps): Promise<ExecutionResult> {
  if (undo.type === "remove_personal_expense") {
    await deps.personal.remove(undo.id);
    return { status: "saved", message: "Undone." };
  }
  const res = await deleteExpenseOrQueue(undo.groupId, undo.expenseId, deps.enqueue);
  if (res.error) return { status: "failed", message: res.error };
  invalidateGroup(deps.qc, undo.groupId);
  return { status: onlineManager.isOnline() ? "saved" : "queued", message: "Undone — the expense was removed." };
}
