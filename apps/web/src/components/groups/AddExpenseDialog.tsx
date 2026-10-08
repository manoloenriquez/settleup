"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/client";
import { ContentDialog } from "@/components/ui/ContentDialog";
import { QuickAddExpense } from "./QuickAddExpense";
import { ConversationInput } from "./ConversationInput";
import { ReceiptUploader } from "./ReceiptUploader";
import { ReceiptReviewForm, type ReceiptReview } from "./ReceiptReviewForm";
import { AddExpenseForm, makeEmptyItem, type ItemState } from "./AddExpenseForm";
import { CategorySelect } from "./CategoryControls";
import { Button } from "@/components/ui/Button";
import { Zap, MessageSquare, Camera, SlidersHorizontal } from "lucide-react";
import type { ExpenseCategory, GroupMember } from "@template/supabase";
import type { ExpenseDraft, ParsedReceipt } from "@template/shared/types";
import {
  amountToInput,
  equalSplit,
  parseAmountInput,
  resolveExactMember,
  type CurrencyCode,
} from "@template/shared";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { formatCurrency, hundredthsToInput } from "@/lib/currency";

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
  /** The group's default currency; new expenses start in it. */
  defaultCurrency: CurrencyCode;
};
type Mode = "quick" | "chat" | "receipt" | "detailed";
const modes = [
  { id: "quick", label: "Quick", icon: Zap },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "receipt", label: "Receipt", icon: Camera },
  { id: "detailed", label: "Detailed", icon: SlidersHorizontal },
] satisfies { id: Mode; label: string; icon: typeof Zap }[];

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AddExpenseDialog({
  open,
  onClose,
  groupId,
  members,
  categories,
  currentUserId,
  defaultCurrency,
}: Props): React.ReactElement {
  const activeMembers = members.filter((member) => !member.departed_at);
  const myMemberId = activeMembers.find((member) => member.user_id === currentUserId)?.id ?? "";
  const defaultCategory = categories.find((category) => category.slug === "other")?.id ?? null;
  const emptyItem = (): ItemState =>
    makeEmptyItem(
      activeMembers.map((member) => member.id),
      myMemberId,
      defaultCategory,
    );
  const [mode, setMode] = useState<Mode>("quick");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [items, setItems] = useState<ItemState[]>(() => [emptyItem()]);
  const [expenseDate, setExpenseDate] = useState(today);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [draftCategoryId, setDraftCategoryId] = useState<string | null>(null);
  const [payerId, setPayerId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const firstItem = items[0];
  const quickCompatible =
    items.length === 1 &&
    firstItem?.splitMode === "equal" &&
    !firstItem.splitPayer &&
    firstItem.expenseMode === "whole" &&
    firstItem.repeats === "none";
  const validMembers = new Set(activeMembers.map((member) => member.id));
  const resolved =
    validMembers.has(payerId) &&
    participantIds.length > 0 &&
    participantIds.every((id) => validMembers.has(id)) &&
    new Set(participantIds).size === participantIds.length;
  // AI drafts report hundredths; read them as an amount in the chosen currency.
  const draftAmountInput = draft ? hundredthsToInput(draft.amount_cents, currency) : "";
  const draftMinor = draft ? parseAmountInput(draftAmountInput, currency) : null;
  const shares =
    draftMinor !== null && resolved ? equalSplit(draftMinor, participantIds.length) : [];
  const autoResolved = useRef<string>("");

  useEffect(() => {
    if (open) track({ name: "expense_draft_started", properties: { entry_mode: mode } });
  }, [open, mode]);

  function handleDraft(value: ExpenseDraft): void {
    track({ name: "ai_draft_generated", properties: { source: "chat" } });
    setDraft(value);
    const payer = resolveExactMember(value.payer_name, activeMembers) ?? "";
    const participants = value.participant_names.length
      ? value.participant_names.map((name) => resolveExactMember(name, activeMembers) ?? "")
      : activeMembers.map((member) => member.id);
    autoResolved.current = JSON.stringify([payer, participants]);
    setPayerId(payer);
    setParticipantIds(participants);
    setDraftCategoryId(
      categories.find((category) => category.slug === value.category_slug)?.id ?? defaultCategory,
    );
  }

  function reviewDraft(): void {
    if (!draft || !resolved) return;
    track({
      name: "ai_draft_resolved",
      properties: {
        status:
          autoResolved.current === JSON.stringify([payerId, participantIds]) ? "accepted" : "edited",
      },
    });
    setItems([
      {
        ...emptyItem(),
        origin: "chat",
        itemName: draft.item_name,
        amountStr: draftAmountInput,
        notes: draft.notes ?? "",
        categoryId: draftCategoryId,
        selectedIds: participantIds,
        payers: [{ memberId: payerId, amountStr: draftAmountInput }],
      },
    ]);
    setExpenseDate(draft.date ?? today());
    setDraft(null);
    setMode("detailed");
  }

  function reviewReceipt(value: ReceiptReview): void {
    const edited =
      receipt !== null &&
      (value.totalCents !== receipt.total_cents || value.items.length !== receipt.line_items.length);
    track({ name: "ai_draft_resolved", properties: { status: edited ? "edited" : "accepted" } });
    setItems([
      {
        ...emptyItem(),
        origin: "receipt",
        itemName: value.itemName,
        amountStr: amountToInput(value.totalCents, value.currency),
        expenseMode: "itemized",
        lineItems: value.items.map((item) => ({
          name: item.name,
          amountStr: amountToInput(item.amountCents, value.currency),
          participantIds: activeMembers.map((member) => member.id),
        })),
      },
    ]);
    setCurrency(value.currency);
    setExpenseDate(value.date ?? today());
    setReceipt(null);
    setMode("detailed");
  }

  function handleSaved(): void {
    setItems([emptyItem()]);
    setExpenseDate(today());
    setDraft(null);
    setReceipt(null);
    setMode("quick");
    setCurrency(defaultCurrency);
    onClose();
  }

  return (
    <ContentDialog open={open} onClose={onClose} title="Add expense" size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          Your draft stays here when you switch entry modes or close this dialog.
        </p>
        <div className="max-w-xs">
          <CurrencySelect
            id="expense-currency"
            label="Currency"
            value={currency}
            onChange={setCurrency}
          />
          {currency !== defaultCurrency && (
            <p className="mt-1 text-xs text-slate-500">
              This group usually uses {defaultCurrency}. Balances in each currency are kept separate.
            </p>
          )}
        </div>
        <div
          className="flex gap-1 rounded-lg bg-slate-100 p-1"
          role="tablist"
          aria-label="Expense entry mode"
        >
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              aria-controls={`expense-mode-${id}`}
              id={`expense-tab-${id}`}
              onClick={() => setMode(id)}
              onKeyDown={(event) => {
                const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!offset && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const index = modes.findIndex((entry) => entry.id === id);
                const next =
                  modes[
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? modes.length - 1
                        : (index + offset + modes.length) % modes.length
                  ];
                if (next) {
                  setMode(next.id);
                  document.getElementById(`expense-tab-${next.id}`)?.focus();
                }
              }}
              tabIndex={mode === id ? 0 : -1}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium ${mode === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        {draft && (
          <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <h3 className="font-semibold">Review suggested expense</h3>
            <p>
              {draft.item_name} ·{" "}
              {draftMinor !== null
                ? formatCurrency(draftMinor, currency)
                : `${draftAmountInput} ${currency}`}
            </p>
            <p className="text-xs text-slate-600">
              Check every person below. Unknown or duplicate names need your correction before
              continuing.
            </p>
            <label className="text-sm">
              Paid by {draft.payer_name ? `(suggested: ${draft.payer_name})` : "(choose a payer)"}
              <select
                aria-label="Resolved payer"
                value={payerId}
                onChange={(event) => setPayerId(event.target.value)}
                className="mt-1 block w-full rounded-lg border p-2"
              >
                <option value="">Choose a member</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
              </select>
            </label>
            {participantIds.map((id, index) => (
              <label key={index} className="text-sm">
                Participant {index + 1}
                {draft.participant_names[index]
                  ? ` (suggested: ${draft.participant_names[index]})`
                  : ""}
                <select
                  aria-label={`Resolved participant ${index + 1}`}
                  value={id}
                  onChange={(event) =>
                    setParticipantIds((previous) =>
                      previous.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    )
                  }
                  className="mt-1 block w-full rounded-lg border p-2"
                >
                  <option value="">Choose a member</option>
                  {activeMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name}
                    </option>
                  ))}
                </select>
                {resolved && (
                  <span className="text-xs">
                    Share:{" "}
                    {formatCurrency(shares[[...participantIds].sort().indexOf(id)] ?? 0, currency)}
                  </span>
                )}
              </label>
            ))}
            <CategorySelect
              categories={categories}
              value={draftCategoryId}
              onChange={setDraftCategoryId}
            />
            <div className="flex gap-2">
              <Button onClick={reviewDraft} disabled={!resolved}>
                Edit and review before saving
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  track({ name: "ai_draft_resolved", properties: { status: "discarded" } });
                  setDraft(null);
                }}
              >
                Dismiss suggestion
              </Button>
            </div>
          </div>
        )}
        <div
          hidden={mode !== "quick" || Boolean(draft)}
          id="expense-mode-quick"
          role="tabpanel"
          aria-labelledby="expense-tab-quick"
        >
          {quickCompatible && firstItem ? (
            <QuickAddExpense
              groupId={groupId}
              members={activeMembers}
              categories={categories}
              currentUserId={currentUserId}
              item={firstItem}
              currency={currency}
              setItem={(update) =>
                setItems((previous) =>
                  previous.map((item, index) => (index === 0 ? update(item) : item)),
                )
              }
              expenseDate={expenseDate}
              setExpenseDate={setExpenseDate}
              onClose={handleSaved}
              onMoreOptions={() => setMode("detailed")}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Your draft contains detailed splits, multiple expenses, or recurring settings.
              </p>
              <Button onClick={() => setMode("detailed")}>Continue editing detailed draft</Button>
            </div>
          )}
        </div>
        <div
          hidden={mode !== "detailed" || Boolean(draft)}
          id="expense-mode-detailed"
          role="tabpanel"
          aria-labelledby="expense-tab-detailed"
        >
          <AddExpenseForm
            groupId={groupId}
            members={activeMembers}
            categories={categories}
            items={items}
            setItems={setItems}
            expenseDate={expenseDate}
            setExpenseDate={setExpenseDate}
            currency={currency}
            onSaved={handleSaved}
          />
        </div>
        <div
          hidden={mode !== "chat" || Boolean(draft)}
          id="expense-mode-chat"
          role="tabpanel"
          aria-labelledby="expense-tab-chat"
        >
          <ConversationInput groupId={groupId} members={activeMembers} onDraft={handleDraft} />
        </div>
        <div
          hidden={mode !== "receipt" || Boolean(draft)}
          id="expense-mode-receipt"
          role="tabpanel"
          aria-labelledby="expense-tab-receipt"
        >
          {receipt ? (
            <ReceiptReviewForm
              receipt={receipt}
              currency={currency}
              onContinue={reviewReceipt}
              onDismiss={() => {
                track({ name: "ai_draft_resolved", properties: { status: "discarded" } });
                setReceipt(null);
              }}
            />
          ) : (
            <ReceiptUploader
              onParsed={(parsed) => {
                track({ name: "ai_draft_generated", properties: { source: "receipt" } });
                setReceipt(parsed);
              }}
            />
          )}
        </div>
      </div>
    </ContentDialog>
  );
}
