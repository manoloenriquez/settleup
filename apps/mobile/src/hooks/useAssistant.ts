import { useCallback, useEffect, useRef, useState } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  EMPTY_FOCUS,
  buildModelContext,
  formatAmount,
  isLoadRequest,
  mergeFollowUp,
  nextFocus,
  pendingAfter,
  resolveCommand,
  revalidateProposal,
  type AssistantCommand,
  type AssistantFocus,
  type AssistantHints,
  type AssistantPlan,
  type AssistantReceipt,
  type AssistantSnapshot,
  type ClarifyChoice,
  type CurrencyCode,
  type LoadRequest,
  type PendingTurn,
} from "@template/shared";
import { isCurrencyCode } from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import { useOutbox } from "@/context/OutboxContext";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { usePreferences } from "@/context/PreferencesContext";
import { localTodayISO } from "@/lib/dates";
import { buildSnapshot, loadGroupData } from "@/lib/assistant/snapshot";
import { interpretMessage } from "@/lib/assistant/interpret";
import { executeProposal, undoAction, type ExecutionResult, type ExecutorDeps } from "@/lib/assistant/executor";
import { assistantStoreKey, clearTranscript, loadTranscript, saveTranscript, type StoredMessage } from "@/lib/assistant/storage";
import type { ExpenseWithDetails } from "@/services/expenses";
import type { ReceiptReview } from "@template/shared";

export type ProposalState = "open" | "running" | "done" | "cancelled" | "replaced";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  /** Plain summary kept in the stored transcript (cards are not stored). */
  note?: string | null;
  plan?: AssistantPlan;
  /** What produced this plan, so a tapped choice can resolve again without the model. */
  source?: { command: AssistantCommand; text: string; receipt?: AssistantReceipt; hints?: AssistantHints };
  proposalState?: ProposalState;
  result?: ExecutionResult;
  undone?: boolean;
  /** Loaded from a previous session: text only. */
  restored?: boolean;
};

const HISTORY_TURNS = 4;

export function receiptForAssistant(review: ReceiptReview): AssistantReceipt {
  const currency = review.currency.value?.toUpperCase() ?? null;
  return {
    totalMinor: review.total_cents.value,
    currency: currency && isCurrencyCode(currency) ? (currency as CurrencyCode) : null,
    merchant: review.merchant.value,
    date: review.date.value,
    overall: review.overall,
    issues: review.issues,
  };
}

function summarize(plan: AssistantPlan): string | null {
  if (plan.kind === "propose") return `${plan.proposal.title}: ${plan.proposal.lines.map((l) => `${l.label} ${l.value}`).join(" · ")}`.slice(0, 300);
  if (plan.kind === "answer" && plan.card) {
    return plan.card.rows
      .slice(0, 4)
      .map((r) => `${r.label} ${formatAmount(r.amountMinor, r.currency)}`)
      .join(" · ")
      .slice(0, 300);
  }
  return null;
}

export function useAssistant() {
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const { enqueue, entries: outboxEntries } = useOutbox();
  const ledger = usePersonalLedger();
  const { preferences } = usePreferences();
  const userId = session?.user.id ?? null;
  const storeKey = assistantStoreKey(userId);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  /** False until this account's stored conversation is loaded; sending waits for it. */
  const [ready, setReady] = useState(false);
  const focusRef = useRef<AssistantFocus>(EMPTY_FOCUS);
  const pendingRef = useRef<PendingTurn | null>(null);
  const fullExpenses = useRef(new Map<string, ExpenseWithDetails[]>());
  const running = useRef(new Set<string>());
  const loadedKey = useRef<string | null>(null);

  // One conversation per account (and one for the guest); switching accounts
  // never shows another account's conversation.
  useEffect(() => {
    let cancelled = false;
    loadedKey.current = null;
    setReady(false);
    focusRef.current = EMPTY_FOCUS;
    pendingRef.current = null;
    fullExpenses.current = new Map();
    setMessages([]);
    void loadTranscript(storeKey).then((stored) => {
      if (cancelled) return;
      setMessages(stored.map((m) => ({ ...m, restored: true })));
      loadedKey.current = storeKey;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storeKey]);

  useEffect(() => {
    if (loadedKey.current !== storeKey) return;
    const stored: StoredMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text.slice(0, 2000),
      note: m.result ? `${m.result.message}` : (m.note ?? (m.plan ? summarize(m.plan) : null)),
      at: m.at,
    }));
    void saveTranscript(storeKey, stored);
  }, [messages, storeKey]);

  const myName = profile?.full_name?.trim() || session?.user.email?.split("@")[0] || null;

  const snapshot = useCallback(
    async (): Promise<AssistantSnapshot> =>
      buildSnapshot({
        qc,
        online: onlineManager.isOnline(),
        userId,
        myName,
        defaultCurrency: preferences.defaultCurrency,
        personal: ledger.expenses,
        today: localTodayISO(),
        fullExpenses: fullExpenses.current,
        pendingWrites: outboxEntries.length,
      }),
    [qc, userId, myName, preferences.defaultCurrency, ledger.expenses, outboxEntries.length],
  );

  const executorDeps: ExecutorDeps = {
    qc,
    enqueue,
    userId,
    myName,
    personal: { add: ledger.add, remove: ledger.remove },
  };

  /** Resolve with one round of data loading when a question needs it. */
  const plan = useCallback(
    async (command: AssistantCommand, text: string, hints: AssistantHints | undefined, receipt: AssistantReceipt | undefined): Promise<AssistantPlan> => {
      let snap = await snapshot();
      let result: AssistantPlan | LoadRequest = resolveCommand({ command, text, snapshot: snap, focus: focusRef.current, hints, newId: () => Crypto.randomUUID(), receipt });
      if (isLoadRequest(result)) {
        try {
          await loadGroupData(qc, result.groupIds, (id) => snap.groups.find((g) => g.id === id)?.currency ?? "PHP", fullExpenses.current);
        } catch {
          // Fall through with what is cached; the answer says it is partial.
        }
        snap = { ...(await snapshot()), online: false };
        result = resolveCommand({ command, text, snapshot: snap, focus: focusRef.current, hints, newId: () => Crypto.randomUUID(), receipt });
      }
      return isLoadRequest(result) ? { kind: "refuse", text: "I couldn't load that right now. Try again in a moment." } : result;
    },
    [qc, snapshot],
  );

  const pushAssistant = useCallback((p: AssistantPlan, source: UiMessage["source"]) => {
    focusRef.current = nextFocus(focusRef.current, p);
    pendingRef.current = source ? pendingAfter(p, source.command, source.text) : null;
    setMessages((prev) => [
      // A new preview replaces any earlier one still waiting for an answer.
      ...prev.map((m) => (m.proposalState === "open" ? { ...m, proposalState: "replaced" as const } : m)),
      {
        id: Crypto.randomUUID(),
        role: "assistant",
        text: p.text,
        at: new Date().toISOString(),
        plan: p,
        source,
        proposalState: p.kind === "propose" ? "open" : undefined,
      },
    ]);
  }, []);

  const send = useCallback(
    async (rawText: string, receipt?: AssistantReceipt) => {
      const text = rawText.trim() || (receipt ? "Add this receipt" : "");
      if (!text || busy || !ready) return;
      setBusy(true);
      setMessages((prev) => [
        ...prev,
        { id: Crypto.randomUUID(), role: "user", text, at: new Date().toISOString(), note: receipt ? "Attached a receipt" : null },
      ]);
      try {
        const snap = await snapshot();
        const history = messages
          .filter((m) => !m.restored)
          .slice(-HISTORY_TURNS * 2)
          .map((m) => ({ role: m.role, content: m.text.slice(0, 300) }));
        const interpretation = await interpretMessage({
          text,
          history,
          context: buildModelContext(snap, focusRef.current),
          userName: snap.myName,
          today: snap.today,
        });
        const merged = receipt ? { command: interpretation.command, text } : mergeFollowUp(pendingRef.current, interpretation.command, text);
        const result = await plan(merged.command, merged.text, undefined, receipt);
        pushAssistant(result, { command: merged.command, text: merged.text, receipt });
      } catch (error) {
        pushAssistant({ kind: "refuse", text: error instanceof Error ? `Something went wrong: ${error.message}` : "Something went wrong." }, undefined);
      } finally {
        setBusy(false);
      }
    },
    [busy, ready, messages, plan, pushAssistant, snapshot],
  );

  const choose = useCallback(
    async (messageId: string, choice: ClarifyChoice) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message?.source || busy) return;
      setBusy(true);
      setMessages((prev) => [...prev, { id: Crypto.randomUUID(), role: "user", text: choice.label, at: new Date().toISOString() }]);
      try {
        // Earlier taps in the same request still apply ("Which John?" then "Which group?").
        const hints = { ...message.source.hints, ...choice.hints, memberIds: { ...message.source.hints?.memberIds, ...choice.hints.memberIds } };
        const result = await plan(message.source.command, message.source.text, hints, message.source.receipt);
        pushAssistant(result, { ...message.source, hints });
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, plan, pushAssistant],
  );

  const setProposalState = (id: string, state: ProposalState, result?: ExecutionResult): void =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, proposalState: state, ...(result ? { result } : {}) } : m)));

  const confirm = useCallback(
    async (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.plan?.kind !== "propose" || message.proposalState !== "open") return;
      const proposal = message.plan.proposal;
      // Single flight per proposal: a double tap can never run it twice.
      if (running.current.has(proposal.id)) return;
      running.current.add(proposal.id);
      setProposalState(messageId, "running");
      try {
        const fresh = await snapshot();
        const stale = revalidateProposal(proposal, fresh);
        if (stale) {
          setProposalState(messageId, "done", { status: "failed", message: stale });
          return;
        }
        const result = await executeProposal(proposal, executorDeps);
        setProposalState(messageId, "done", result);
        if (result.status !== "failed") {
          pendingRef.current = null;
          if (proposal.action.type === "add_group_expense") {
            focusRef.current = { ...focusRef.current, groupId: proposal.action.groupId, expenseIds: [proposal.id] };
          }
        }
      } finally {
        running.current.delete(proposal.id);
      }
    },
    // executorDeps is rebuilt each render from stable pieces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, snapshot, qc, enqueue, userId, myName, ledger.add, ledger.remove],
  );

  const cancel = useCallback((messageId: string) => {
    pendingRef.current = null;
    setProposalState(messageId, "cancelled");
  }, []);

  const undo = useCallback(
    async (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      const undoable = message?.result?.undo;
      if (!message || !undoable || message.undone) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, undone: true } : m)));
      const result = await undoAction(undoable, executorDeps);
      setMessages((prev) => [...prev, { id: Crypto.randomUUID(), role: "assistant", text: result.message, at: new Date().toISOString(), result }]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, qc, enqueue, userId, ledger.remove],
  );

  const clear = useCallback(async () => {
    focusRef.current = EMPTY_FOCUS;
    pendingRef.current = null;
    setMessages([]);
    await clearTranscript(storeKey);
  }, [storeKey]);

  return { messages, busy: busy || !ready, send, choose, confirm, cancel, undo, clear, isGuest: !userId };
}
