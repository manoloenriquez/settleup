"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addExpensesBatch, addItemizedExpense } from "@/app/actions/expenses";
import { parsePHPAmount, formatCents, equalSplit } from "@template/shared";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { SplitModeToggle } from "./SplitModeToggle";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import type { GroupMember } from "@template/supabase";

type SplitMode = "equal" | "custom";

type PayerState = {
  memberId: string;
  amountStr: string;
};

type LineItemState = {
  name: string;
  amountStr: string;
  participantIds: string[];
};

type ItemState = {
  itemName: string;
  amountStr: string;
  selectedIds: string[];
  splitMode: SplitMode;
  customAmounts: Record<string, string>;
  payers: PayerState[];
  splitPayer: boolean;
  expenseMode: "whole" | "itemized";
  lineItems: LineItemState[];
};

function makeEmptyItem(allMemberIds: string[], firstMemberId: string, previousSelectedIds?: string[]): ItemState {
  return {
    itemName: "",
    amountStr: "",
    selectedIds: previousSelectedIds ?? allMemberIds,
    splitMode: "equal",
    customAmounts: {},
    payers: [{ memberId: firstMemberId, amountStr: "" }],
    splitPayer: false,
    expenseMode: "whole",
    lineItems: [{ name: "", amountStr: "", participantIds: allMemberIds }],
  };
}

function makeEmptyLineItem(allMemberIds: string[]): LineItemState {
  return { name: "", amountStr: "", participantIds: allMemberIds };
}

type Props = {
  groupId: string;
  members: GroupMember[];
};

export function AddExpenseForm({ groupId, members }: Props): React.ReactElement {
  const allMemberIds = members.map((m) => m.id);
  const firstMemberId = members[0]?.id ?? "";
  const [items, setItems] = useState<ItemState[]>([makeEmptyItem(allMemberIds, firstMemberId)]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState<Record<number, boolean>>({});
  const router = useRouter();

  function updateItem(index: number, patch: Partial<ItemState>): void {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function toggleMember(index: number, memberId: string): void {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = item.selectedIds.includes(memberId)
          ? item.selectedIds.filter((x) => x !== memberId)
          : [...item.selectedIds, memberId];
        const customAmounts = { ...item.customAmounts };
        delete customAmounts[memberId];
        return { ...item, selectedIds: next, customAmounts };
      }),
    );
  }

  function addItem(): void {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, makeEmptyItem(allMemberIds, firstMemberId, last?.selectedIds)];
    });
  }

  function removeItem(index: number): void {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(itemIndex: number, liIndex: number, patch: Partial<LineItemState>): void {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const newLineItems = item.lineItems.map((li, j) => (j === liIndex ? { ...li, ...patch } : li));
        return { ...item, lineItems: newLineItems };
      }),
    );
  }

  function toggleLineItemMember(itemIndex: number, liIndex: number, memberId: string): void {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const newLineItems = item.lineItems.map((li, j) => {
          if (j !== liIndex) return li;
          const next = li.participantIds.includes(memberId)
            ? li.participantIds.filter((x) => x !== memberId)
            : [...li.participantIds, memberId];
          return { ...li, participantIds: next };
        });
        return { ...item, lineItems: newLineItems };
      }),
    );
  }

  function addLineItem(itemIndex: number): void {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        return { ...item, lineItems: [...item.lineItems, makeEmptyLineItem(allMemberIds)] };
      }),
    );
  }

  function removeLineItem(itemIndex: number, liIndex: number): void {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        return { ...item, lineItems: item.lineItems.filter((_, j) => j !== liIndex) };
      }),
    );
  }

  function getCustomSum(item: ItemState): number {
    return item.selectedIds.reduce((sum, id) => {
      const v = parsePHPAmount(item.customAmounts[id] ?? "0") ?? 0;
      return sum + v;
    }, 0);
  }

  function getPayerSum(item: ItemState): number {
    return item.payers.reduce((sum, p) => {
      const v = parsePHPAmount(p.amountStr) ?? 0;
      return sum + v;
    }, 0);
  }

  function getLineItemsTotal(item: ItemState): number {
    return item.lineItems.reduce((sum, li) => sum + (parsePHPAmount(li.amountStr) ?? 0), 0);
  }

  function isItemValid(item: ItemState): boolean {
    const amountCents = parsePHPAmount(item.amountStr) ?? 0;
    if (!item.itemName.trim() || amountCents === 0) return false;
    if (item.payers.length === 0) return false;
    if (item.payers.some((p) => !p.memberId)) return false;

    if (item.expenseMode === "itemized") {
      // payer sum must match
      if (item.splitPayer && getPayerSum(item) !== amountCents) return false;
      // all line items must have name, amount > 0, at least one participant
      for (const li of item.lineItems) {
        const liCents = parsePHPAmount(li.amountStr) ?? 0;
        if (!li.name.trim() || liCents <= 0 || li.participantIds.length === 0) return false;
      }
      // line items total must equal expense amount
      if (getLineItemsTotal(item) !== amountCents) return false;
      return true;
    }

    // whole mode
    if (item.selectedIds.length === 0) return false;
    if (item.splitMode === "custom") {
      if (getCustomSum(item) !== amountCents) return false;
    }
    if (item.splitPayer) {
      if (getPayerSum(item) !== amountCents) return false;
    }
    return true;
  }

  const allValid = items.every(isItemValid);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);

    // Separate itemized from whole expenses
    const wholeItems = items.filter((item) => item.expenseMode === "whole");
    const itemizedItems = items.filter((item) => item.expenseMode === "itemized");

    startTransition(async () => {
      // Submit whole-expense items as batch
      if (wholeItems.length > 0) {
        const batchItems = wholeItems.map((item) => {
          const amount_cents = parsePHPAmount(item.amountStr)!;
          const payers = item.splitPayer
            ? item.payers
                .filter((p) => p.memberId)
                .map((p) => ({
                  member_id: p.memberId,
                  paid_cents: parsePHPAmount(p.amountStr) ?? 0,
                }))
            : [{ member_id: item.payers[0]!.memberId, paid_cents: amount_cents }];

          if (item.splitMode === "equal") {
            return {
              item_name: item.itemName.trim(),
              amount_cents,
              split_mode: "equal" as const,
              participant_ids: item.selectedIds,
              payers,
            };
          }
          return {
            item_name: item.itemName.trim(),
            amount_cents,
            split_mode: "custom" as const,
            participant_ids: item.selectedIds,
            custom_splits: item.selectedIds.map((id) => ({
              member_id: id,
              share_cents: parsePHPAmount(item.customAmounts[id] ?? "0") ?? 0,
            })),
            payers,
          };
        });

        const result = await addExpensesBatch({ group_id: groupId, items: batchItems });
        if (result.error) {
          setError(result.error);
          return;
        }
      }

      // Submit each itemized expense individually
      for (const item of itemizedItems) {
        const amount_cents = parsePHPAmount(item.amountStr)!;
        const payers = item.splitPayer
          ? item.payers
              .filter((p) => p.memberId)
              .map((p) => ({
                member_id: p.memberId,
                paid_cents: parsePHPAmount(p.amountStr) ?? 0,
              }))
          : [{ member_id: item.payers[0]!.memberId, paid_cents: amount_cents }];

        const line_items = item.lineItems.map((li) => ({
          name: li.name.trim(),
          amount_cents: parsePHPAmount(li.amountStr)!,
          participant_ids: li.participantIds,
        }));

        const result = await addItemizedExpense({
          group_id: groupId,
          item_name: item.itemName.trim(),
          amount_cents,
          payers,
          line_items,
        });

        if (result.error) {
          setError(result.error);
          return;
        }
      }

      setItems([makeEmptyItem(allMemberIds, firstMemberId)]);
      setShowAdvanced({});
      toast.success("Expense added!");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {items.map((item, index) => {
        const amountCents = parsePHPAmount(item.amountStr) ?? 0;
        const customSum = getCustomSum(item);
        const customMismatch = item.splitMode === "custom" && amountCents > 0 && customSum !== amountCents;
        const advanced = showAdvanced[index] ?? false;
        const lineItemsTotal = getLineItemsTotal(item);
        const lineItemsMismatch = item.expenseMode === "itemized" && amountCents > 0 && lineItemsTotal !== amountCents;

        // Preview text for equal split
        const splitPreview =
          item.expenseMode === "whole" && item.splitMode === "equal" && amountCents > 0 && item.selectedIds.length > 0
            ? `Split ${item.selectedIds.length} ways: ~${formatCents(equalSplit(amountCents, item.selectedIds.length)[0] ?? 0)} each`
            : null;

        return (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col gap-4"
          >
            {items.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Expense {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <X size={12} /> Remove
                </button>
              </div>
            )}

            {/* Expense mode toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Mode:</span>
              <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => updateItem(index, { expenseMode: "whole" })}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    item.expenseMode === "whole"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Split equally
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(index, { expenseMode: "itemized" })}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    item.expenseMode === "itemized"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Itemized
                </button>
              </div>
            </div>

            {/* Core fields — always visible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label={item.expenseMode === "itemized" ? "Expense name" : "Item name"}
                value={item.itemName}
                onChange={(e) => updateItem(index, { itemName: e.target.value })}
                placeholder={item.expenseMode === "itemized" ? "e.g. Dinner at Jollibee" : "e.g. Wahunori"}
              />
              <Input
                label="Total amount"
                leftAddon="₱"
                value={item.amountStr}
                onChange={(e) => updateItem(index, { amountStr: e.target.value })}
                placeholder="e.g. 8703.39"
              />
            </div>

            {/* Paid by — always visible */}
            {!item.splitPayer && (
              <Select
                label="Paid by"
                value={item.payers[0]?.memberId ?? ""}
                onChange={(e) =>
                  updateItem(index, {
                    payers: [{ memberId: e.target.value, amountStr: "" }],
                  })
                }
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </Select>
            )}

            {/* Split preview (whole mode only) */}
            {splitPreview && (
              <p className="text-xs text-slate-500">{splitPreview}</p>
            )}

            {/* Itemized mode: line items */}
            {item.expenseMode === "itemized" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-slate-700">Line items</p>
                {item.lineItems.map((li, liIndex) => {
                  const liCents = parsePHPAmount(li.amountStr) ?? 0;
                  const liPreview =
                    liCents > 0 && li.participantIds.length > 0
                      ? `~${formatCents(equalSplit(liCents, li.participantIds.length)[0] ?? 0)} each`
                      : null;
                  return (
                    <div
                      key={liIndex}
                      className="rounded-md border border-slate-200 bg-white p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Input
                            label="Item"
                            value={li.name}
                            onChange={(e) => updateLineItem(index, liIndex, { name: e.target.value })}
                            placeholder="e.g. Burger"
                          />
                          <Input
                            label="Amount"
                            leftAddon="₱"
                            value={li.amountStr}
                            onChange={(e) => updateLineItem(index, liIndex, { amountStr: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        {item.lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index, liIndex)}
                            className="self-end pb-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Who had this?</p>
                        <div className="flex flex-wrap gap-1.5">
                          {members.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleLineItemMember(index, liIndex, m.id)}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                                li.participantIds.includes(m.id)
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {m.display_name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {liPreview && (
                        <p className="text-xs text-slate-500">{li.participantIds.length} people · {liPreview}</p>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addLineItem(index)}
                  className="self-start text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus size={12} /> Add line item
                </button>
                {amountCents > 0 && (
                  <p className={`text-xs font-medium ${lineItemsMismatch ? "text-red-600" : "text-slate-500"}`}>
                    {formatCents(lineItemsTotal)} of {formatCents(amountCents)} allocated
                    {lineItemsMismatch ? " — line items must sum to total" : ""}
                  </p>
                )}
              </div>
            )}

            {/* Advanced toggle (whole mode) / Multi-payer toggle (itemized mode) */}
            {item.expenseMode === "whole" ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => ({ ...prev, [index]: !advanced }))}
                  className="self-start text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {advanced ? "Less options" : "More options"}
                </button>

                {advanced && (
                  <div className="flex flex-col gap-4 animate-slide-down">
                    {/* Member toggles */}
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Split between</p>
                      <div className="flex flex-wrap gap-2">
                        {members.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMember(index, m.id)}
                            className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                              item.selectedIds.includes(m.id)
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {m.display_name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Split mode toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">Split:</span>
                      <SplitModeToggle
                        value={item.splitMode}
                        onChange={(mode) => {
                          if (mode === "smart") return;
                          updateItem(index, { splitMode: mode, customAmounts: {} });
                        }}
                        showSmart={false}
                      />
                    </div>

                    {/* Multi-payer toggle */}
                    <PayerSection
                      item={item}
                      index={index}
                      members={members}
                      firstMemberId={firstMemberId}
                      amountCents={amountCents}
                      updateItem={updateItem}
                      getPayerSum={getPayerSum}
                    />

                    {/* Custom split inputs */}
                    {item.splitMode === "custom" && item.selectedIds.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-slate-700">Custom amounts</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {item.selectedIds.map((id) => {
                            const member = members.find((m) => m.id === id);
                            if (!member) return null;
                            return (
                              <div key={id}>
                                <Input
                                  label={member.display_name}
                                  leftAddon="₱"
                                  value={item.customAmounts[id] ?? ""}
                                  onChange={(e) =>
                                    updateItem(index, {
                                      customAmounts: { ...item.customAmounts, [id]: e.target.value },
                                    })
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                            );
                          })}
                        </div>
                        <p className={`text-xs font-medium ${customMismatch ? "text-red-600" : "text-slate-500"}`}>
                          {formatCents(customSum)} of {formatCents(amountCents)} assigned
                          {customMismatch ? " — amounts must match total" : ""}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Itemized mode: show multi-payer option inline */
              <PayerSection
                item={item}
                index={index}
                members={members}
                firstMemberId={firstMemberId}
                amountCents={amountCents}
                updateItem={updateItem}
                getPayerSum={getPayerSum}
              />
            )}
          </div>
        );
      })}

      {/* "Add another item" only available in whole mode */}
      {items.every((it) => it.expenseMode === "whole") && (
        <button
          type="button"
          onClick={addItem}
          className="self-start text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          <Plus size={14} /> Add another item
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" isLoading={isPending} disabled={!allValid || isPending}>
        Add {items.length} item{items.length !== 1 ? "s" : ""}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// PayerSection — extracted to avoid repetition
// ---------------------------------------------------------------------------

type PayerSectionProps = {
  item: ItemState;
  index: number;
  members: GroupMember[];
  firstMemberId: string;
  amountCents: number;
  updateItem: (index: number, patch: Partial<ItemState>) => void;
  getPayerSum: (item: ItemState) => number;
};

function PayerSection({ item, index, members, firstMemberId, amountCents, updateItem, getPayerSum }: PayerSectionProps): React.ReactElement {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-slate-700">Paid by</p>
        <button
          type="button"
          onClick={() => {
            if (item.splitPayer) {
              updateItem(index, {
                splitPayer: false,
                payers: [item.payers[0] ?? { memberId: firstMemberId, amountStr: "" }],
              });
            } else {
              updateItem(index, { splitPayer: true });
            }
          }}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {item.splitPayer ? "Single payer" : "Split payment"}
        </button>
      </div>

      {item.splitPayer && (
        <div className="flex flex-col gap-2">
          {item.payers.map((payer, pi) => (
            <div key={pi} className="flex gap-2 items-end">
              <div className="flex-1">
                <Select
                  value={payer.memberId}
                  onChange={(e) => {
                    const newPayers = [...item.payers];
                    newPayers[pi] = { ...payer, memberId: e.target.value };
                    updateItem(index, { payers: newPayers });
                  }}
                >
                  <option value="">Select member</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Input
                  label="Amount"
                  leftAddon="₱"
                  value={payer.amountStr}
                  onChange={(e) => {
                    const newPayers = [...item.payers];
                    newPayers[pi] = { ...payer, amountStr: e.target.value };
                    updateItem(index, { payers: newPayers });
                  }}
                  placeholder="0.00"
                />
              </div>
              {item.payers.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const newPayers = item.payers.filter((_, j) => j !== pi);
                    updateItem(index, { payers: newPayers });
                  }}
                  className="text-red-500 hover:text-red-700 text-sm pb-2"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              updateItem(index, {
                payers: [...item.payers, { memberId: "", amountStr: "" }],
              })
            }
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium self-start flex items-center gap-1"
          >
            <Plus size={12} /> Add payer
          </button>
          {amountCents > 0 && (
            <p
              className={`text-xs font-medium ${
                getPayerSum(item) !== amountCents ? "text-red-600" : "text-slate-500"
              }`}
            >
              {formatCents(getPayerSum(item))} of {formatCents(amountCents)} assigned
              {getPayerSum(item) !== amountCents ? " — amounts must match total" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
