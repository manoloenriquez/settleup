import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

// ---------------------------------------------------------------------------
// The assistant conversation, on this device only. One store per account (and
// one for the guest), like the personal ledger. It keeps message text and card
// summaries — never ids or balances beyond what was already shown — capped at
// 40 messages. Account transcripts are removed with the account's other data
// (account-data.ts) and by "Clear conversation".
// ---------------------------------------------------------------------------

export const ASSISTANT_GUEST_KEY = "talli:assistant:v1:guest";
const ACCOUNT_PREFIX = "talli:assistant:v1:account:";
export const MAX_STORED_MESSAGES = 40;

export function assistantAccountPrefix(): string {
  return ACCOUNT_PREFIX;
}

export function assistantStoreKey(ownerId: string | null): string {
  if (!ownerId) return ASSISTANT_GUEST_KEY;
  const project = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  return `${ACCOUNT_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(ownerId)}`;
}

export const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
  /** Short summary of a card or result, e.g. "Expense added · ₱2,500.00". */
  note: z.string().max(300).nullable().optional(),
  at: z.string(),
});
export type StoredMessage = z.infer<typeof storedMessageSchema>;

const storeSchema = z.object({ v: z.literal(1), messages: z.array(storedMessageSchema) });

export async function loadTranscript(key: string): Promise<StoredMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.messages : [];
  } catch {
    return [];
  }
}

export async function saveTranscript(key: string, messages: StoredMessage[]): Promise<void> {
  const kept = messages.slice(-MAX_STORED_MESSAGES);
  await AsyncStorage.setItem(key, JSON.stringify({ v: 1, messages: kept }));
}

export async function clearTranscript(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
