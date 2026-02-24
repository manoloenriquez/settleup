"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExpense } from "@/app/actions/expenses";
import { parseExpenseText, fuzzyMatchMember, formatCents } from "@template/shared";
import { Button } from "@/components/ui/Button";
import type { GroupMember } from "@template/supabase";

type Props = {
  groupId: string;
  members: GroupMember[];
};

export function ChatExpenseInput({ groupId, members }: Props): React.ReactElement {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseExpenseText> | null>(null);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleParse() {
    setError(null);
    const result = parseExpenseText(text);
    setParsed(result);

    if (result.participantNames.length === 0) {
      // All members
      setResolvedIds(members.map((m) => m.id));
    } else {
      const ids = result.participantNames
        .map((name) => fuzzyMatchMember(name, members))
        .filter((id): id is string => id !== null);
      setResolvedIds(ids);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) return;
    setError(null);

    if (!parsed.amountCents) {
      setError("Could not parse an amount from input.");
      return;
    }
    if (resolvedIds.length === 0) {
      setError("No participants matched.");
      return;
    }

    const defaultPayerId = members[0]?.id;
    if (!defaultPayerId) {
      setError("No members available to be payer.");
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        group_id: groupId,
        item_name: parsed.itemName,
        amount_cents: parsed.amountCents!,
        participant_ids: resolvedIds,
        payers: [{ member_id: defaultPayerId, paid_cents: parsed.amountCents! }],
      });
      if (result.error) {
        setError(result.error);
      } else {
        setText("");
        setParsed(null);
        setResolvedIds([]);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <textarea
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Wahunori 8703.39 split Manolo Yao"
        />
        <Button type="button" variant="secondary" size="sm" onClick={handleParse}>
          Parse
        </Button>
      </div>

      {parsed && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
          <p>
            <span className="font-medium">Item:</span> {parsed.itemName}
          </p>
          <p>
            <span className="font-medium">Amount:</span>{" "}
            {parsed.amountCents ? formatCents(parsed.amountCents) : "unknown"}
          </p>
          <p>
            <span className="font-medium">Participants:</span>{" "}
            {resolvedIds.length > 0
              ? resolvedIds
                  .map((id) => members.find((m) => m.id === id)?.display_name ?? id)
                  .join(", ")
              : "none matched"}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {parsed && (
        <Button type="submit" isLoading={isPending}>
          Add Expense
        </Button>
      )}
    </form>
  );
}
