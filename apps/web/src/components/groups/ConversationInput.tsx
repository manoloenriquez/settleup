"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { parseConversationMessage } from "@/app/actions/ai";
import { Button } from "@/components/ui/Button";
import { Send, Sparkles } from "lucide-react";
import type { ConversationMessage, ExpenseDraft } from "@template/shared/types";
import type { GroupMember } from "@template/supabase";

type Props = {
  groupId: string;
  members: GroupMember[];
  onDraft: (draft: ExpenseDraft) => void;
};

const QUICK_CHIPS = [
  "Lunch 500 split equally",
  "Grab taxi 250",
  "Coffee 180 for Manolo and Yao",
];

export function ConversationInput({ groupId, members, onDraft }: Props): React.ReactElement {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend(text?: string): void {
    const content = (text ?? input).trim();
    if (!content) return;

    const userMessage: ConversationMessage = { role: "user", content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    const memberNames = members.map((m) => m.display_name);

    startTransition(async () => {
      const result = await parseConversationMessage({
        group_id: groupId,
        messages: updatedMessages,
        member_names: memberNames,
      });

      if (result.data) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.data!.reply }]);
        if (result.data.draft) {
          onDraft(result.data.draft);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.error ?? "Something went wrong." },
        ]);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Sparkles size={20} className="text-indigo-400 mb-2" />
            <p className="text-sm text-slate-500">
              Describe an expense in plain language
            </p>
            <p className="text-xs text-slate-400 mt-1">
              e.g. &quot;Lunch at Jollibee 500 pesos split between everyone&quot;
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === "user"
                ? "self-end bg-indigo-600 text-white"
                : "self-start bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {isPending && (
          <div className="self-start flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>

      {/* Quick chips */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleSend(chip)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type an expense..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <Button
          onClick={() => handleSend()}
          disabled={!input.trim() || isPending}
          isLoading={isPending}
          size="sm"
          leftIcon={Send}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
