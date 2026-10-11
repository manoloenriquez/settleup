import { z } from "zod";
import { currencyCodeSchema } from "../utils/currency";
import { CATEGORY_SLUGS } from "../utils/category";

// ---------------------------------------------------------------------------
// Personal expenses — a single person's own spending.
//
// They are not a ledger between people: there are no payers, shares or
// balances, so they are stored apart from group expenses. On the device they
// are the source of truth (guests have nothing else); signed-in users also
// sync them to `settleup.personal_expenses`.
// ---------------------------------------------------------------------------

/** Largest amount accepted for one personal expense, in minor units. */
export const MAX_PERSONAL_AMOUNT_MINOR = 99_999_999_999;

export const personalExpenseSourceSchema = z.enum(["manual", "receipt", "chat"]);

/**
 * `local`: saved only on this device and not tied to an account (guest data).
 * `pending`: belongs to an account and still has to be uploaded.
 * `synced`: the server has acknowledged this exact version.
 */
export const personalSyncStateSchema = z.enum(["local", "pending", "synced"]);

const isoDateTime = z.iso.datetime({ offset: true });

export const personalExpenseSchema = z.object({
  id: z.uuid(),
  description: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().min(1).max(MAX_PERSONAL_AMOUNT_MINOR),
  currency: currencyCodeSchema,
  category: z.enum(CATEGORY_SLUGS),
  date: z.iso.date(),
  notes: z.string().max(500).nullable(),
  merchant: z.string().max(120).nullable(),
  source: personalExpenseSourceSchema,
  createdAt: isoDateTime,
  /** When this device last changed the record. Display only — never used to resolve conflicts. */
  updatedAt: isoDateTime,
  /** Tombstone: deleted records are kept so the deletion can sync and be undone. */
  deletedAt: isoDateTime.nullable(),
  sync: personalSyncStateSchema,
  /** Server `updated_at` of the last acknowledged version, when synced. */
  serverUpdatedAt: isoDateTime.nullable(),
});

export const personalLedgerStateSchema = z.object({
  version: z.literal(1),
  expenses: z.array(personalExpenseSchema),
  /**
   * Newest server version received by a PULL. Acknowledgements of this
   * device's own uploads never move it, or rows other devices wrote earlier
   * would be skipped.
   */
  pullCursor: isoDateTime.nullable().optional(),
});

/** What a form, receipt or chat draft provides when saving an expense. */
export const personalExpenseInputSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Add a short description, like “Coffee” or “Groceries”.")
    .max(120, "Keep the description under 120 characters."),
  amountMinor: z
    .number()
    .int()
    .min(1, "Enter an amount greater than zero.")
    .max(MAX_PERSONAL_AMOUNT_MINOR, "That amount is too large."),
  currency: currencyCodeSchema,
  category: z.enum(CATEGORY_SLUGS),
  date: z.iso.date("Choose a valid date."),
  notes: z.string().trim().max(500, "Keep notes under 500 characters.").nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  source: personalExpenseSourceSchema,
});
