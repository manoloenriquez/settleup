"use server";

import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { parseReceiptImage } from "@/lib/ai/receipt";
import { suggestSplit } from "@/lib/ai/smart-split";
import { parseConversation } from "@/lib/ai/conversation";
import { AI_LIMITS } from "@template/shared/constants";
import { conversationMessageSchema } from "@template/shared/schemas";
import type { ApiResponse } from "@template/shared/types";
import type { ParsedReceipt, SmartSplitResult, ExpenseDraft } from "@template/shared/types";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Receipt parsing
// ---------------------------------------------------------------------------

export async function parseReceipt(
  formData: FormData,
): Promise<ApiResponse<ParsedReceipt>> {
  try {
    const user = await assertAuth();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { data: null, error: "No file provided" };
    }

    if (file.size > AI_LIMITS.MAX_FILE_SIZE_BYTES) {
      return { data: null, error: `File too large. Max ${AI_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` };
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowedTypes.includes(file.type)) {
      return { data: null, error: "Unsupported file type. Use JPEG, PNG, or WebP." };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return await parseReceiptImage(buffer, user.id);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Smart split
// ---------------------------------------------------------------------------

const smartSplitInputSchema = z.object({
  group_id: z.string().uuid(),
  item_name: z.string().min(1),
  amount_cents: z.number().int().positive(),
  member_names: z.array(z.string()),
  context: z.string().optional(),
});

export async function getSmartSplit(
  input: unknown,
): Promise<ApiResponse<SmartSplitResult>> {
  try {
    const user = await assertAuth();

    const parsed = smartSplitInputSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    return await suggestSplit({
      item_name: parsed.data.item_name,
      amount_cents: parsed.data.amount_cents,
      member_names: parsed.data.member_names,
      context: parsed.data.context,
      userId: user.id,
    });
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Conversation parsing
// ---------------------------------------------------------------------------

const conversationInputSchema = z.object({
  group_id: z.string().uuid(),
  messages: z.array(conversationMessageSchema).min(1).max(AI_LIMITS.MAX_CONVERSATION_MESSAGES),
  member_names: z.array(z.string()),
});

export async function parseConversationMessage(
  input: unknown,
): Promise<ApiResponse<{ reply: string; draft: ExpenseDraft | null }>> {
  try {
    const user = await assertAuth();

    const parsed = conversationInputSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    return await parseConversation({
      messages: parsed.data.messages,
      member_names: parsed.data.member_names,
      userId: user.id,
    });
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
