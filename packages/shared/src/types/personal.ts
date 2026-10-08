import type { z } from "zod";
import type {
  personalExpenseInputSchema,
  personalExpenseSchema,
  personalLedgerStateSchema,
  personalExpenseSourceSchema,
  personalSyncStateSchema,
} from "../schemas/personal";

export type PersonalExpense = z.infer<typeof personalExpenseSchema>;
export type PersonalLedgerState = z.infer<typeof personalLedgerStateSchema>;
export type PersonalExpenseInput = z.input<typeof personalExpenseInputSchema>;
export type PersonalExpenseSource = z.infer<typeof personalExpenseSourceSchema>;
export type PersonalSyncState = z.infer<typeof personalSyncStateSchema>;
