import { useCallback, useRef, useState } from "react";
import type { ConversationMessage } from "@template/shared/types";
import type { ExpenseDraft } from "@template/shared/types";
import { parseConversationMobile } from "@/lib/ai/conversation";

type UseConversationAIOptions = {
  members: { id: string; display_name: string }[];
  /** Display name of the signed-in member; lets "I paid" resolve to a member. */
  userName: string | null;
};

/** Local YYYY-MM-DD (never UTC — toISOString is a day off after 8am PH). */
function localTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function useConversationAI({ members, userName }: UseConversationAIOptions) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesRef = useRef<ConversationMessage[]>([]);

  const memberNames = members.map((m) => m.display_name);

  const sendMessage = useCallback(async (text: string): Promise<{ reply: string; draft: ExpenseDraft | null }> => {
    if (!text.trim()) return { reply: "", draft: null };

    const nextMessage: ConversationMessage = { role: "user", content: text.trim() };
    const newMessages = [...messagesRef.current, nextMessage];
    messagesRef.current = newMessages;
    setMessages(newMessages);
    setIsProcessing(true);

    try {
      const result = await parseConversationMobile({
        messages: newMessages,
        memberNames,
        members,
        userName,
        today: localTodayISO(),
      });

      const reply = result.data?.reply ?? (result.error ? `Error: ${result.error}` : "Something went wrong.");
      const newDraft = result.data?.draft ?? null;

      setMessages((prev): ConversationMessage[] => {
        const nextReply: ConversationMessage = { role: "assistant", content: reply };
        const next = [...prev, nextReply];
        messagesRef.current = next;
        return next;
      });
      setDraft(newDraft);
      return { reply, draft: newDraft };
    } finally {
      setIsProcessing(false);
    }
  }, [memberNames, members, userName]);

  const clearDraft = useCallback(() => setDraft(null), []);
  const reset = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setDraft(null);
  }, []);

  return { messages, draft, isProcessing, sendMessage, clearDraft, reset };
}
