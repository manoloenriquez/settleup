// ---------------------------------------------------------------------------
// AI feature types — used by web app LLM layer and shared validation
// ---------------------------------------------------------------------------

export type ExpenseDraft = {
  item_name: string;
  amount_cents: number;
  confidence: number; // 0–1
  participant_names: string[]; // raw names, resolved via fuzzyMatchMember
  payer_name: string | null;
  notes: string | null;
  source: "receipt" | "conversation" | "manual";
};

export type ReceiptLineItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};

export type ParsedReceipt = {
  merchant: string | null;
  date: string | null; // ISO date string
  line_items: ReceiptLineItem[];
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number;
  raw_text: string;
  confidence: number; // 0–1
};

export type SplitSuggestion = {
  member_name: string;
  share_cents: number;
  reason: string | null;
};

export type SmartSplitResult = {
  mode: "equal" | "custom";
  suggestions: SplitSuggestion[];
  explanation: string | null;
  confidence: number; // 0–1
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InsightsSummary = {
  total_expenses: number;
  total_amount_cents: number;
  average_expense_cents: number;
  top_spender: { name: string; amount_cents: number } | null;
  most_common_item: { name: string; count: number } | null;
  period: { first_expense: string; last_expense: string } | null;
  llm_summary: string | null;
};
