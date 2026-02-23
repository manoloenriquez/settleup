"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExpensesBatch } from "@/app/actions/expenses";
import { parsePHPAmount, formatCents } from "@template/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { GroupMember } from "@template/supabase";

type SplitMode = "equal" | "custom";

type ItemState = {
  itemName: string;
  amountStr: string;
  selectedIds: string[];
  splitMode: SplitMode;
  customAmounts: Record<string, string>; // memberId → "₱ string"
};

function makeEmptyItem(allMemberIds: string[], previousSelectedIds?: string[]): ItemState {
  return {
    itemName: "",
    amountStr: "",
    selectedIds: previousSelectedIds ?? allMemberIds,
    splitMode: "equal",
    customAmounts: {},
  };
}

type Props = {
  groupId: string;
  members: GroupMember[];
};

export function AddExpenseForm({ groupId, members }: Props): React.ReactElement {
  const allMemberIds = members.map((m) => m.id);
  const [items, setItems] = useState<ItemState[]>([makeEmptyItem(allMemberIds)]);
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
      return [...prev, makeEmptyItem(allMemberIds, last?.selectedIds)];
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

  function isItemValid(item: ItemState): boolean {
    const amountCents = parsePHPAmount(item.amountStr) ?? 0;
    if (!item.itemName.trim() || amountCents === 0) return false;
    if (item.selectedIds.length === 0) return false;
    if (item.splitMode === "custom") {
      return getCustomSum(item) === amountCents;
    }
    return true;
  }

  const allValid = items.every(isItemValid);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const batchItems = items.map((item) => {
      const amount_cents = parsePHPAmount(item.amountStr)!;
      if (item.splitMode === "equal") {
        return {
          item_name: item.itemName.trim(),
          amount_cents,
          split_mode: "equal" as const,
          participant_ids: item.selectedIds,
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
      };
    });

    startTransition(async () => {
      const result = await addExpensesBatch({ group_id: groupId, items: batchItems });
      if (result.error) {
        setError(result.error);
      } else {
        setItems([makeEmptyItem(allMemberIds)]);
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
