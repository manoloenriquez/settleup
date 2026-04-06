"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addMembersBatch } from "@/app/actions/members";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UserPlus } from "lucide-react";

type Props = {
  groupId: string;
};

export function AddMemberForm({ groupId }: Props): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function enqueue() {
    const name = inputValue.trim();
    if (!name) return;
    setQueue((prev) => [...prev, name]);
    setInputValue("");
    inputRef.current?.focus();
  }

  function removeName(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      enqueue();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Queue any name currently typed
    const name = inputValue.trim();
    const toSubmit = name ? [...queue, name] : queue;
    if (toSubmit.length === 0) return;

    setError(null);
    startTransition(async () => {
      const result = await addMembersBatch({ group_id: groupId, display_names: toSubmit });
      if (result.error) {
        setError(result.error);
      } else {
        setQueue([]);
        setInputValue("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="h-7 w-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
          <UserPlus size={14} className="text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Add Members</p>
          <p className="text-xs text-slate-400">Type a name, press Enter to queue, then add all at once.</p>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Input
          ref={inputRef}
          label="Add members"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Display name — press Enter to queue"
          maxLength={80}
        />
        <Button type="button" variant="secondary" size="sm" onClick={enqueue} className="shrink-0 mb-0.5">
          Queue
        </Button>
      </div>

      {queue.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {queue.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800"
            >
              {name}
              <button
                type="button"
                onClick={() => removeName(i)}
                className="ml-1 text-brand-500 hover:text-brand-800 leading-none"
                aria-label={`Remove ${name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {(queue.length > 0 || inputValue.trim()) && (
        <Button type="submit" isLoading={isPending} className="self-start">
          Add {queue.length + (inputValue.trim() ? 1 : 0)} member
          {queue.length + (inputValue.trim() ? 1 : 0) !== 1 ? "s" : ""}
        </Button>
      )}
    </form>
  );
}
