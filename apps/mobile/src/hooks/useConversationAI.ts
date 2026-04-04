import { useState, useCallback } from "react";
import type { ConversationMessage } from "@template/shared/types";
import type { ExpenseDraft } from "@template/shared/types";
import { parseConversationMobile } from "@/lib/ai/conversation";

type UseConversationAIOptions = {
  groupId: string;
  members: { id: string; display_name: string }[];
};

export function useConversationAI({ groupId, members }: UseConversationAIOptions) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const memberNames = members.map((m) => m.display_name);

  const sendMessage = useCallback(async (text: string): Promise<string> => {
    if (!text.trim()) return "";

    const newMessages: ConversationMessage[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    setMessages(newMessages);
    setIsProcessing(true);

    try {
      const result = await parseConversationMobile({
        groupId,
        messages: newMessages,
        memberNames,
        members,
      });

      const reply = result.data?.reply ?? (result.error ? `Error: ${result.error}` : "Something went wrong.");
      const newDraft = result.data?.draft ?? null;

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setDraft(newDraft);
      return reply;
    } finally {
      setIsProcessing(false);
    }
  }, [groupId, members, memberNames, messages]);

  const clearDraft = useCallback(() => setDraft(null), []);
  const reset = useCallback(() => {
    setMessages([]);
    setDraft(null);
  }, []);

  return { messages, draft, isProcessing, sendMessage, clearDraft, reset };
}
