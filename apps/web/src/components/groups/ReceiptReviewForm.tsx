"use client";

import { useState } from "react";
import { formatCents, parsePHPAmount } from "@template/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { X, Plus, Check } from "lucide-react";
import type { ParsedReceipt, ExpenseDraft } from "@template/shared/types";

type Props = {
  receipt: ParsedReceipt;
  onCreateDraft: (draft: ExpenseDraft) => void;
  onDismiss: () => void;
};

type EditableLineItem = {
  description: string;
  totalStr: string;
};

export function ReceiptReviewForm({ receipt, onCreateDraft, onDismiss }: Props): React.ReactElement {
  const [merchant, setMerchant] = useState(receipt.merchant ?? "");
  const [date, setDate] = useState(receipt.date ?? "");
  const [items, setItems] = useState<EditableLineItem[]>(
    receipt.line_items.map((li) => ({
      description: li.description,
      totalStr: (li.total_cents / 100).toFixed(2),
    })),
  );
  const [totalStr, setTotalStr] = useState((receipt.total_cents / 100).toFixed(2));

  function updateItem(index: number, patch: Partial<EditableLineItem>): void {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number): void {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem(): void {
    setItems((prev) => [...prev, { description: "", totalStr: "" }]);
  }

  function handleCreate(): void {
    const totalCents = parsePHPAmount(totalStr) ?? 0;
    if (totalCents <= 0) return;

    const itemName = merchant || items.map((i) => i.description).filter(Boolean).join(", ") || "Receipt";

    const draft: ExpenseDraft = {
      item_name: itemName,
      amount_cents: totalCents,
      confidence: receipt.confidence,
      participant_names: [],
      payer_name: null,
      notes: items.map((i) => `${i.description}: ₱${i.totalStr}`).join("; "),
      source: "receipt",
    };

    onCreateDraft(draft);
  }

  const totalCents = parsePHPAmount(totalStr) ?? 0;
  const itemsTotal = items.reduce((sum, i) => sum + (parsePHPAmount(i.totalStr) ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 animate-slide-down">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-700">Review Receipt</h4>
          <Badge variant="neutral">
            {Math.round(receipt.confidence * 100)}% confidence
          </Badge>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Store name"
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Line Items
          </p>
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  placeholder="Description"
                />
              </div>
              <div className="w-28">
                <Input
                  leftAddon="₱"
                  value={item.totalStr}
                  onChange={(e) => updateItem(index, { totalStr: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="text-slate-400 hover:text-red-500 pb-2"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="self-start text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
          >
            <Plus size={12} /> Add line item
          </button>
          {itemsTotal > 0 && (
            <p className="text-xs text-slate-500">
              Items subtotal: {formatCents(itemsTotal)}
            </p>
          )}
        </div>
      )}

      <Input
        label="Total"
        leftAddon="₱"
        value={totalStr}
        onChange={(e) => setTotalStr(e.target.value)}
      />

      <Button onClick={handleCreate} disabled={totalCents <= 0} leftIcon={Check} size="sm">
        Create Expense Draft
      </Button>
    </div>
  );
}
