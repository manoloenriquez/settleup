import { onlineManager, type QueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { budgetRevision, type BudgetConfig, type BudgetDocument, type PersonalExpense, type PersonalExpenseInput, type Proposal } from "@template/shared";
import type { BudgetActions } from "@/hooks/useBudgetActions";
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
  | { type: "remove_personal_expense"; id: string }
  | { type: "restore_personal_expense"; id: string }
  | {
      type: "revert_personal_expense";
      id: string;
      input: PersonalExpenseInput;
      /** What the assistant wrote; undo only if the expense still looks like this. */
      written: { description: string; amountMinor: number; date: string };
    }
  /** Budget undos apply only if nothing changed the budget since (same revision). */
  | { type: "budget_turn_off"; revision: string }
  | { type: "budget_restore"; config: BudgetConfig; effectiveFrom: string | null; revision: string }
  | { type: "budget_remove_note"; id: string; revision: string };

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
    update: (id: string, input: PersonalExpenseInput) => Promise<void>;
    remove: (id: string) => Promise<void>;
    restore: (id: string) => Promise<void>;
    /** The current stored record (not a snapshot copy). */
    get: (id: string) => PersonalExpense | undefined;
  };
  budget?: {
    actions: BudgetActions;
    /** The stored document right now (not a snapshot copy). */
    current: () => BudgetDocument | null;
    /** Settings in force on a date (today when null), for undoing a change. */
    configOn: (date: string | null) => BudgetConfig | null;
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
      case "edit_personal_expense":
      case "delete_personal_expense": {
        // Checked against the stored record right before writing.
        const current = deps.personal.get(a.expenseId);
        if (!current || current.deletedAt) return { status: "failed", message: "That expense was deleted." };
        if (current.updatedAt !== a.expectedUpdatedAt) {
          return { status: "failed", message: "That expense was changed since I showed you this. Ask again to see the latest." };
        }
        const previous: PersonalExpenseInput = {
          description: current.description,
          amountMinor: current.amountMinor,
          currency: current.currency,
          category: current.category,
          date: current.date,
          notes: current.notes,
          merchant: current.merchant,
          source: current.source,
        };
        if (a.type === "delete_personal_expense") {
          await deps.personal.remove(a.expenseId);
          return { status: "saved", message: "Expense deleted.", undo: { type: "restore_personal_expense", id: a.expenseId } };
        }
        // Only what the preview showed changes; notes, merchant and source stay.
        await deps.personal.update(a.expenseId, {
          ...previous,
          description: a.description,
          amountMinor: a.amountMinor,
          date: a.date,
        });
        return {
          status: "saved",
          message: "Expense updated.",
          undo: {
            type: "revert_personal_expense",
            id: a.expenseId,
            input: previous,
            written: { description: a.description, amountMinor: a.amountMinor, date: a.date },
          },
        };
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
      case "budget_setup": {
        if (!deps.budget) return { status: "failed", message: "Your budget isn't available right now." };
        const doc = await deps.budget.actions.setUp(a.config, { startDate: a.startDate, source: "assistant", summary: "Set up with the Assistant" });
        return { status: "saved", message: "Budget set up. It's on the Spending tab.", undo: { type: "budget_turn_off", revision: budgetRevision(doc) } };
      }
      case "budget_change": {
        if (!deps.budget) return { status: "failed", message: "Your budget isn't available right now." };
        // The settings the change replaced: those in force on the day it takes effect.
        const before = deps.budget.configOn(a.effectiveFrom);
        const doc = await deps.budget.actions.changeSettings(a.config, a.summary, "assistant", a.effectiveFrom ?? undefined);
        return {
          status: "saved",
          message: "Budget updated.",
          ...(before ? { undo: { type: "budget_restore" as const, config: before, effectiveFrom: a.effectiveFrom, revision: budgetRevision(doc) } } : {}),
        };
      }
      case "budget_plan": {
        if (!deps.budget) return { status: "failed", message: "Your budget isn't available right now." };
        const { doc, id } = await deps.budget.actions.addNote({
          kind: "planned",
          name: a.name,
          amountMinor: a.amountMinor,
          from: a.from,
          to: a.to,
          coversAllSpending: a.coversAllSpending,
          category: null,
        });
        return { status: "saved", message: `Set aside for ${a.name}.`, undo: { type: "budget_remove_note", id, revision: budgetRevision(doc) } };
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
  if (undo.type === "budget_turn_off" || undo.type === "budget_restore" || undo.type === "budget_remove_note") {
    const budget = deps.budget;
    if (!budget) return { status: "failed", message: "Your budget isn't available right now." };
    if (budgetRevision(budget.current()) !== undo.revision) {
      return { status: "failed", message: "Your budget changed after that, so I left it as it is." };
    }
    if (undo.type === "budget_turn_off") await budget.actions.turnOff();
    else if (undo.type === "budget_restore") await budget.actions.changeSettings(undo.config, "Undo (Assistant)", "undo", undo.effectiveFrom ?? undefined);
    else await budget.actions.removeNote(undo.id);
    return { status: "saved", message: "Undone." };
  }
  if (undo.type === "remove_personal_expense") {
    await deps.personal.remove(undo.id);
    return { status: "saved", message: "Undone." };
  }
  if (undo.type === "restore_personal_expense") {
    const current = deps.personal.get(undo.id);
    if (current && !current.deletedAt) return { status: "failed", message: "That expense is already back." };
    await deps.personal.restore(undo.id);
    return { status: "saved", message: "Undone — the expense is back." };
  }
  if (undo.type === "revert_personal_expense") {
    // Don't overwrite a change made after the assistant's.
    const current = deps.personal.get(undo.id);
    const w = undo.written;
    if (!current || current.deletedAt || current.description !== w.description || current.amountMinor !== w.amountMinor || current.date !== w.date) {
      return { status: "failed", message: "That expense changed after my edit, so I left it as it is." };
    }
    await deps.personal.update(undo.id, undo.input);
    return { status: "saved", message: "Undone — the expense is back to how it was." };
  }
  const res = await deleteExpenseOrQueue(undo.groupId, undo.expenseId, deps.enqueue);
  if (res.error) return { status: "failed", message: res.error };
  invalidateGroup(deps.qc, undo.groupId);
  return { status: onlineManager.isOnline() ? "saved" : "queued", message: "Undone — the expense was removed." };
}
