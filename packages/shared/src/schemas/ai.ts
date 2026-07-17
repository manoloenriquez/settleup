import { z } from "zod";

// ---------------------------------------------------------------------------
// AI feature Zod schemas
//
// All object schemas are strict: LLM output with unexpected keys is rejected
// rather than silently passed through, so hallucinated fields never reach
// application code.
// ---------------------------------------------------------------------------

export const receiptLineItemSchema = z.strictObject({
  description: z.string(),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int(),
  total_cents: z.number().int(),
});

/**
 * Tolerance for receipt arithmetic: max(₱1, 2% of the total). Receipts often
 * carry rounding centavos, inclusive VAT, or service charges the model folds
 * into line items — a strict equality check would reject good parses and push
 * them into the OCR/regex fallbacks.
 */
function receiptSumTolerance(totalCents: number): number {
  return Math.max(100, Math.round(Math.abs(totalCents) * 0.02));
}

/**
 * Refinement-free receipt shape. On-device guided generation (Apple Foundation
 * Models) needs a plain JSON-schema-convertible object — `superRefine` cannot
 * cross that boundary, so the cross-field sum check lives only on
 * `parsedReceiptSchema` below.
 */
export const parsedReceiptBaseSchema = z.strictObject({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  line_items: z.array(receiptLineItemSchema),
  subtotal_cents: z.number().int().nullable(),
  tax_cents: z.number().int().nullable(),
  total_cents: z.number().int(),
  raw_text: z.string(),
  confidence: z.number().min(0).max(1),
});

export const parsedReceiptSchema = parsedReceiptBaseSchema
  .superRefine((receipt, ctx) => {
    // Totals-only parses (no line items) are valid drafts.
    if (receipt.line_items.length === 0) return;

    const itemSum = receipt.line_items.reduce((sum, li) => sum + li.total_cents, 0);
    const tol = receiptSumTolerance(receipt.total_cents);

    const matchesSubtotal =
      receipt.subtotal_cents !== null &&
      Math.abs(itemSum - receipt.subtotal_cents) <= tol;
    const matchesTotalWithTax =
      Math.abs(itemSum + (receipt.tax_cents ?? 0) - receipt.total_cents) <= tol;
    const matchesTotal = Math.abs(itemSum - receipt.total_cents) <= tol;

    if (!matchesSubtotal && !matchesTotalWithTax && !matchesTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Line items sum (${itemSum}) does not match receipt totals (subtotal ${receipt.subtotal_cents}, tax ${receipt.tax_cents}, total ${receipt.total_cents})`,
        path: ["line_items"],
      });
    }
  });

export const expenseDraftSchema = z.strictObject({
  item_name: z.string().min(1),
  amount_cents: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
  confidence: z.number().min(0).max(1),
  participant_names: z.array(z.string()),
  payer_name: z.string().nullable(),
  category_slug: z.string().nullable().default(null),
  notes: z.string().nullable(),
  date: z.iso.date().nullable().default(null),
  source: z.enum(["receipt", "conversation", "manual"]),
});

export const splitSuggestionSchema = z.strictObject({
  member_name: z.string(),
  share_cents: z.number().int(),
  reason: z.string().nullable(),
});

export const smartSplitResultSchema = z.strictObject({
  mode: z.enum(["equal", "custom"]),
  suggestions: z.array(splitSuggestionSchema),
  explanation: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const conversationMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const llmSummarySchema = z.strictObject({
  summary: z.string(),
});

export const insightsSummarySchema = z.strictObject({
  total_expenses: z.number().int().nonnegative(),
  total_amount_cents: z.number().int(),
  average_expense_cents: z.number().int(),
  top_spender: z
    .strictObject({ name: z.string(), amount_cents: z.number().int() })
    .nullable(),
  most_common_item: z
    .strictObject({ name: z.string(), count: z.number().int().positive() })
    .nullable(),
  top_category: z
    .strictObject({ name: z.string(), slug: z.string(), amount_cents: z.number().int() })
    .nullable(),
  categories: z.array(
    z.strictObject({
      id: z.string().uuid().nullable(),
      name: z.string(),
      slug: z.string(),
      icon: z.string(),
      color: z.string(),
      amount_cents: z.number().int(),
      expense_count: z.number().int().nonnegative(),
    }),
  ),
  period: z
    .strictObject({ first_expense: z.string(), last_expense: z.string() })
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
export type LlmSummaryInput = z.infer<typeof llmSummarySchema>;
