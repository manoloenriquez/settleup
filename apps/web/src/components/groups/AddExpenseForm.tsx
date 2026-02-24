"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExpensesBatch } from "@/app/actions/expenses";
import { parsePHPAmount, formatCents } from "@template/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { GroupMember } from "@template/supabase";

type SplitMode = "equal" | "custom";

type PayerState = {
  memberId: string;
  amountStr: string;
};

type ItemState = {
  itemName: string;
  amountStr: string;
  selectedIds: string[];
  splitMode: SplitMode;
  customAmounts: Record<string, string>; // memberId → "₱ string"
  payers: PayerState[];
  splitPayer: boolean;
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
  };
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
  const router = useRouter();

  function updateItem(index: number, patch: Partial<ItemState>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function toggleMember(index: number, memberId: string) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = item.selectedIds.includes(memberId)
          ? item.selectedIds.filter((x) => x !== memberId)
          : [...item.selectedIds, memberId];
        // Reset custom amounts when membership changes
        const customAmounts = { ...item.customAmounts };
        delete customAmounts[memberId];
        return { ...item, selectedIds: next, customAmounts };
      }),
    );
  }

  function addItem() {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, makeEmptyItem(allMemberIds, firstMemberId, last?.selectedIds)];
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
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

  function isItemValid(item: ItemState): boolean {
    const amountCents = parsePHPAmount(item.amountStr) ?? 0;
    if (!item.itemName.trim() || amountCents === 0) return false;
    if (item.selectedIds.length === 0) return false;
    if (item.splitMode === "custom") {
      if (getCustomSum(item) !== amountCents) return false;
    }
    // Single payer: auto-synced, always valid. Multi-payer: must sum to total.
    if (item.splitPayer) {
      if (getPayerSum(item) !== amountCents) return false;
    }
    if (item.payers.length === 0) return false;
    if (item.payers.some((p) => !p.memberId)) return false;
    return true;
  }

  const allValid = items.every(isItemValid);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const batchItems = items.map((item) => {
      const amount_cents = parsePHPAmount(item.amountStr)!;
      // Build payers array
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

    startTransition(async () => {
      const result = await addExpensesBatch({ group_id: groupId, items: batchItems });
      if (result.error) {
        setError(result.error);
      } else {
        setItems([makeEmptyItem(allMemberIds, firstMemberId)]);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {items.map((item, index) => {
        const amountCents = parsePHPAmount(item.amountStr) ?? 0;
        const customSum = getCustomSum(item);
        const customMismatch = item.splitMode === "custom" && amountCents > 0 && customSum !== amountCents;

        return (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Item {index + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  × Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Input
                  label="Item name"
                  value={item.itemName}
                  onChange={(e) => updateItem(index, { itemName: e.target.value })}
                  placeholder="e.g. Wahunori"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Input
                  label="Amount (₱)"
                  value={item.amountStr}
                  onChange={(e) => updateItem(index, { amountStr: e.target.value })}
                  placeholder="e.g. 8703.39"
                />
              </div>
            </div>

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
              {(["equal", "custom"] as SplitMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateItem(index, { splitMode: mode, customAmounts: {} })}
                  className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors capitalize ${
                    item.splitMode === mode
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Paid by */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-700">Paid by</p>
                <button
                  type="button"
                  onClick={() => {
                    if (item.splitPayer) {
                      // Collapse back to single payer
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

              {!item.splitPayer ? (
                <select
                  value={item.payers[0]?.memberId ?? ""}
                  onChange={(e) =>
                    updateItem(index, {
                      payers: [{ memberId: e.target.value, amountStr: "" }],
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-col gap-2">
                  {item.payers.map((payer, pi) => (
                    <div key={pi} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <select
                          value={payer.memberId}
                          onChange={(e) => {
                            const newPayers = [...item.payers];
                            newPayers[pi] = { ...payer, memberId: e.target.value };
                            updateItem(index, { payers: newPayers });
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        >
                          <option value="">Select member</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <Input
                          label="Amount"
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
                          ×
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
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium self-start"
                  >
                    + Add payer
                  </button>
                  {amountCents > 0 && (
                    <p
                      className={`text-xs font-medium ${
                        getPayerSum(item) !== amountCents ? "text-red-600" : "text-slate-500"
                      }`}
                    >
                      {formatCents(getPayerSum(item))} of {formatCents(amountCents)} assigned
                      {getPayerSum(item) !== amountCents ? " — amounts must match total" : " ✓"}
                    </p>
                  )}
                </div>
              )}
            </div>

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
                  {customMismatch ? " — amounts must match total" : " ✓"}
                </p>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addItem}
        className="self-start text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        + Add item
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" isLoading={isPending} disabled={!allValid || isPending}>
        Add {items.length} item{items.length !== 1 ? "s" : ""}
      </Button>
    </form>
  );
}
