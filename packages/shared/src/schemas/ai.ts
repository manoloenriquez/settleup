import { z } from "zod";

// ---------------------------------------------------------------------------
// AI feature Zod schemas
// ---------------------------------------------------------------------------

export const receiptLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int(),
  total_cents: z.number().int(),
});

export const parsedReceiptSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  line_items: z.array(receiptLineItemSchema),
  subtotal_cents: z.number().int().nullable(),
  tax_cents: z.number().int().nullable(),
  total_cents: z.number().int(),
  raw_text: z.string(),
  confidence: z.number().min(0).max(1),
});

export const expenseDraftSchema = z.object({
  item_name: z.string().min(1),
  amount_cents: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
  confidence: z.number().min(0).max(1),
  participant_names: z.array(z.string()),
  payer_name: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.enum(["receipt", "conversation", "manual"]),
});

export const splitSuggestionSchema = z.object({
  member_name: z.string(),
  share_cents: z.number().int(),
  reason: z.string().nullable(),
});

export const smartSplitResultSchema = z.object({
  mode: z.enum(["equal", "custom"]),
  suggestions: z.array(splitSuggestionSchema),
  explanation: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const insightsSummarySchema = z.object({
  total_expenses: z.number().int().nonnegative(),
  total_amount_cents: z.number().int(),
  average_expense_cents: z.number().int(),
  top_spender: z
    .object({ name: z.string(), amount_cents: z.number().int() })
    .nullable(),
  most_common_item: z
    .object({ name: z.string(), count: z.number().int().positive() })
    .nullable(),
  period: z
    .object({ first_expense: z.string(), last_expense: z.string() })
    .nullable(),
  llm_summary: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Inferred types (these mirror types/ai.ts — use schemas as source of truth)
// ---------------------------------------------------------------------------

export type ReceiptLineItemInput = z.infer<typeof receiptLineItemSchema>;
export type ParsedReceiptInput = z.infer<typeof parsedReceiptSchema>;
export type ExpenseDraftInput = z.infer<typeof expenseDraftSchema>;
export type SplitSuggestionInput = z.infer<typeof splitSuggestionSchema>;
export type SmartSplitResultInput = z.infer<typeof smartSplitResultSchema>;
export type ConversationMessageInput = z.infer<typeof conversationMessageSchema>;
export type InsightsSummaryInput = z.infer<typeof insightsSummarySchema>;
