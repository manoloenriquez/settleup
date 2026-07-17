"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { listExpenseComments, addExpenseComment, deleteExpenseComment } from "@/app/actions/comments";
import type { ExpenseComment } from "@/app/actions/comments";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import type { GroupMember } from "@template/supabase";
import { useOfflineGuard } from "@/hooks/useOfflineGuard";

type Props = {
  expenseId: string;
  members: GroupMember[];
  currentUserId: string;
};

function relativeTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function CommentThread({ expenseId, members, currentUserId }: Props): React.ReactElement {
  const [comments, setComments] = useState<ExpenseComment[] | null>(null);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const guardOnline = useOfflineGuard();

  const nameByUserId = new Map(
    members.filter((m) => m.user_id !== null).map((m) => [m.user_id as string, m.display_name]),
  );

  useEffect(() => {
    let cancelled = false;
    void listExpenseComments(expenseId).then((result) => {
      if (!cancelled) setComments(result.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  function handleSend(): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!guardOnline()) return;
    startTransition(async () => {
      const result = await addExpenseComment({ expense_id: expenseId, body: trimmed });
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to add comment.");
        return;
      }
      setComments((prev) => [...(prev ?? []), result.data!]);
      setBody("");
    });
  }

  function handleDelete(commentId: string): void {
    if (!guardOnline()) return;
    startTransition(async () => {
      const result = await deleteExpenseComment(commentId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    });
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex flex-col gap-2">
      {comments === null && <p className="text-xs text-slate-400">Loading comments…</p>}
      {comments !== null && comments.length === 0 && (
        <p className="text-xs text-slate-400">No comments yet.</p>
      )}
      {(comments ?? []).map((comment) => {
        const authorName = nameByUserId.get(comment.author_user_id) ?? "Member";
        return (
          <div key={comment.id} className="flex items-start gap-2">
            <Avatar name={authorName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs">
                <span className="font-semibold text-slate-700">{authorName}</span>{" "}
                <span className="text-slate-400">{relativeTime(comment.created_at)}</span>
              </p>
              <p className="text-sm text-slate-700 break-words">{comment.body}</p>
            </div>
            {comment.author_user_id === currentUserId && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(comment.id)}
                className="rounded p-1 text-slate-300 hover:text-red-500 transition-colors"
                aria-label="Delete comment"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
      <form
        className="flex gap-2 mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Button type="submit" size="sm" isLoading={isPending} disabled={!body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
