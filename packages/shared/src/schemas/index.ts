import { z } from "zod";

export * from "./ai";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const emailSchema = z.string().trim().email("Invalid email address").toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// SettleUp schemas
// ---------------------------------------------------------------------------

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const renameGroupSchema = z.object({
  group_id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const renameMemberSchema = z.object({
  member_id: z.string().uuid(),
  display_name: z.string().trim().min(1, "Name is required").max(80),
});

export const addMemberSchema = z.object({
  group_id: z.string().uuid(),
  display_name: z.string().trim().min(1, "Name is required").max(80),
});

export const payerSchema = z.object({
  member_id: z.string().uuid(),
  paid_cents: z.number().int().positive("Payer amount must be positive"),
});

export const expenseCategoryIdSchema = z.string().uuid().nullable().optional();

export const expenseCategoryInputSchema = z.object({
  group_id: z.string().uuid(),
  name: z.string().trim().min(1, "Category name is required").max(80),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color").optional(),
  sort_order: z.number().int().optional(),
});

export const updateExpenseCategorySchema = expenseCategoryInputSchema
  .omit({ group_id: true })
  .extend({
    category_id: z.string().uuid(),
  });

export const addExpenseSchema = z
  .object({
    group_id: z.string().uuid(),
    category_id: expenseCategoryIdSchema,
    item_name: z.string().trim().min(1, "Item name is required").max(200),
    amount_cents: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
    notes: z.string().optional(),
    participant_ids: z.array(z.string().uuid()).min(1, "At least one participant required"),
    payers: z.array(payerSchema).min(1, "At least one payer required"),
  })
  .superRefine((val, ctx) => {
    const payerSum = val.payers.reduce((sum, p) => sum + p.paid_cents, 0);
    if (payerSum !== val.amount_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payer total (${payerSum}) must equal amount (${val.amount_cents})`,
        path: ["payers"],
      });
    }
  });

export const addMembersBatchSchema = z.object({
  group_id: z.string().uuid(),
  display_names: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
});

const expenseItemSchema = z.object({
  category_id: expenseCategoryIdSchema,
  item_name: z.string().trim().min(1, "Item name is required").max(200),
  amount_cents: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
  notes: z.string().optional(),
  split_mode: z.enum(["equal", "custom"]),
  participant_ids: z.array(z.string().uuid()).min(1, "At least one participant required"),
  custom_splits: z
    .array(
      z.object({ member_id: z.string().uuid(), share_cents: z.number().int() }),
    )
    .optional(),
  payers: z.array(payerSchema).min(1, "At least one payer required"),
});

export const addExpensesBatchSchema = z
  .object({
    group_id: z.string().uuid(),
    items: z.array(expenseItemSchema).min(1),
  })
  .superRefine((val, ctx) => {
    val.items.forEach((item, i) => {
      if (item.split_mode === "custom") {
        if (!item.custom_splits || item.custom_splits.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Item ${i + 1}: custom splits are required when split_mode is "custom"`,
            path: ["items", i, "custom_splits"],
          });
          return;
        }
        const sum = item.custom_splits.reduce((acc, s) => acc + s.share_cents, 0);
        if (sum !== item.amount_cents) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Item ${i + 1}: custom splits sum (${sum}) must equal amount_cents (${item.amount_cents})`,
            path: ["items", i, "custom_splits"],
          });
        }
      }
      // Validate payer sum matches expense amount
      const payerSum = item.payers.reduce((acc, p) => acc + p.paid_cents, 0);
      if (payerSum !== item.amount_cents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Item ${i + 1}: payer total (${payerSum}) must equal amount_cents (${item.amount_cents})`,
          path: ["items", i, "payers"],
        });
      }
    });
  });

const lineItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(200),
  amount_cents: z.number().int().positive("Amount must be positive"),
  participant_ids: z.array(z.string().uuid()).min(1, "At least one participant required"),
});

export const addItemizedExpenseSchema = z
  .object({
    group_id: z.string().uuid(),
    category_id: expenseCategoryIdSchema,
    item_name: z.string().trim().min(1, "Expense name is required").max(200),
    amount_cents: z.number().int().positive("Amount must be positive"),
    notes: z.string().optional(),
    payers: z.array(payerSchema).min(1, "At least one payer required"),
    line_items: z.array(lineItemSchema).min(1, "At least one line item required"),
  })
  .superRefine((val, ctx) => {
    const payerSum = val.payers.reduce((sum, p) => sum + p.paid_cents, 0);
    if (payerSum !== val.amount_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payer total (${payerSum}) must equal amount (${val.amount_cents})`,
        path: ["payers"],
      });
    }
    const itemSum = val.line_items.reduce((sum, li) => sum + li.amount_cents, 0);
    if (itemSum !== val.amount_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Line items total (${itemSum}) must equal expense amount (${val.amount_cents})`,
        path: ["line_items"],
      });
    }
  });

export const updateExpenseSchema = z
  .object({
    expense_id: z.string().uuid(),
    category_id: expenseCategoryIdSchema,
    item_name: z.string().trim().min(1, "Item name is required").max(200),
    amount_cents: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
    notes: z.string().optional(),
    split_mode: z.enum(["equal", "custom"]),
    participant_ids: z.array(z.string().uuid()).min(1, "At least one participant required"),
    custom_splits: z
      .array(z.object({ member_id: z.string().uuid(), share_cents: z.number().int() }))
      .optional(),
    payers: z.array(payerSchema).min(1, "At least one payer required"),
  })
  .superRefine((val, ctx) => {
    const payerSum = val.payers.reduce((sum, p) => sum + p.paid_cents, 0);
    if (payerSum !== val.amount_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payer total (${payerSum}) must equal amount (${val.amount_cents})`,
        path: ["payers"],
      });
    }
    if (val.split_mode === "custom") {
      if (!val.custom_splits || val.custom_splits.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom splits are required when split_mode is custom",
          path: ["custom_splits"],
        });
        return;
      }
      const splitSum = val.custom_splits.reduce((acc, s) => acc + s.share_cents, 0);
      if (splitSum !== val.amount_cents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Custom splits sum (${splitSum}) must equal amount (${val.amount_cents})`,
          path: ["custom_splits"],
        });
      }
    }
  });

export const updateItemizedExpenseSchema = z
  .object({
    expense_id: z.string().uuid(),
    category_id: expenseCategoryIdSchema,
    item_name: z.string().trim().min(1, "Expense name is required").max(200),
    amount_cents: z.number().int().positive("Amount must be positive"),
    notes: z.string().optional(),
    payers: z.array(payerSchema).min(1, "At least one payer required"),
    line_items: z.array(lineItemSchema).min(1, "At least one line item required"),
  })
  .superRefine((val, ctx) => {
    const payerSum = val.payers.reduce((sum, p) => sum + p.paid_cents, 0);
    if (payerSum !== val.amount_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payer total (${payerSum}) must equal amount (${val.amount_cents})`,
        path: ["payers"],
      });
    }
    const itemSum = val.line_items.reduce((sum, li) => sum + li.amount_cents, 0);
    if (itemSum !== val.amount_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Line items total (${itemSum}) must equal expense amount (${val.amount_cents})`,
        path: ["line_items"],
      });
    }
  });

export const recordPaymentSchema = z
  .object({
    group_id: z.string().uuid(),
    from_member_id: z.string().uuid(),
    to_member_id: z.string().uuid(),
    amount_cents: z.number().int().positive("Amount must be positive"),
  })
  .refine((val) => val.from_member_id !== val.to_member_id, {
    message: "Cannot pay yourself",
    path: ["to_member_id"],
  });

export const joinGroupSchema = z.object({
  invite_code: z.string().trim().min(1, "Invite code is required").max(20),
});

export const claimMemberSchema = z.object({
  member_id: z.string().uuid("Invalid member ID"),
});

export const upsertPaymentProfileSchema = z.object({
  payer_display_name: z.string().optional(),
  gcash_name: z.string().optional(),
  gcash_number: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  notes: z.string().optional(),
});

export const dashboardGroupSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  member_count: z.number().int(),
  pending_count: z.number().int(),
  total_owed_cents: z.number().int(),
  created_at: z.string(),
});

export const dashboardSummarySchema = z.object({
  net_balance_cents: z.number().int(),
  total_groups: z.number().int(),
  total_unsettled_cents: z.number().int(),
  pending_members: z.number().int(),
  groups: z.array(dashboardGroupSummarySchema),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type RenameGroupInput = z.infer<typeof renameGroupSchema>;
export type RenameMemberInput = z.infer<typeof renameMemberSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type AddMembersBatchInput = z.infer<typeof addMembersBatchSchema>;
export type AddExpenseInput = z.infer<typeof addExpenseSchema>;
export type AddExpensesBatchInput = z.infer<typeof addExpensesBatchSchema>;
export type AddItemizedExpenseInput = z.infer<typeof addItemizedExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type UpdateItemizedExpenseInput = z.infer<typeof updateItemizedExpenseSchema>;
export type ExpenseCategoryFormInput = z.infer<typeof expenseCategoryInputSchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
export type PayerInput = z.infer<typeof payerSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type ClaimMemberInput = z.infer<typeof claimMemberSchema>;
export type UpsertPaymentProfileInput = z.infer<typeof upsertPaymentProfileSchema>;
export type DashboardGroupSummaryInput = z.infer<typeof dashboardGroupSummarySchema>;
export type DashboardSummaryInput = z.infer<typeof dashboardSummarySchema>;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
