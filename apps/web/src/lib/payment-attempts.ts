import { z } from "zod";

const attemptSchema = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().positive().max(100_000_000_000),
  note: z.string().max(280),
  submitted: z.boolean(),
});
export type PaymentAttempt = z.infer<typeof attemptSchema>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function readPaymentAttempt(storage: Storage, key: string): PaymentAttempt | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const parsed = attemptSchema.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(
      "Saved payment report could not be read. Check the report history before starting another report.",
    );
  return parsed.data;
}

/** Store the operation before sending it; a refresh or lost response reuses its ID. */
export function preparePaymentAttempt(
  storage: Storage,
  key: string,
  input: { amountCents: number; note: string },
  createId: () => string,
): PaymentAttempt {
  const previous = readPaymentAttempt(storage, key);
  if (previous) {
    if (previous.amountCents !== input.amountCents || previous.note !== input.note)
      throw new Error(
        "Retry the saved payment report first. Its amount and note cannot change while the outcome is uncertain.",
      );
    return previous;
  }
  const attempt = attemptSchema.parse({ ...input, id: createId(), submitted: false });
  storage.setItem(key, JSON.stringify(attempt));
  return attempt;
}

export function markPaymentAttemptSubmitted(
  storage: Storage,
  key: string,
  attempt: PaymentAttempt,
): void {
  storage.setItem(key, JSON.stringify({ ...attempt, submitted: true }));
}
