"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addMembersBatch } from "@/app/actions/members";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
      <div className="flex items-end gap-2">
        <Input
          ref={inputRef}
          label="Add members"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Display name — press Enter to queue"
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
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800"
            >
              {name}
              <button
                type="button"
                onClick={() => removeName(i)}
                className="ml-1 text-indigo-500 hover:text-indigo-800 leading-none"
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
