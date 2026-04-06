// Clients
export { createBrowserClient } from "./browser";
export { createServerClient, type CookieAdapter } from "./server";
export { createMobileClient } from "./mobile";
export { createAnonClient } from "./anon";
export {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
  parseClaimMemberRpcResult,
  parseCreateExpenseRpcResult,
  parseCreateGroupRpcResult,
  parseGroupsWithStatsRpcResult,
  parseInviteCodeRpcResult,
  parseJoinGroupRpcResult,
  parseLeaveGroupRpcResult,
  parseRenameMemberRpcResult,
  parseShareTokenRpcResult,
  parseTransferOwnershipRpcResult,
} from "./settleup";

// Supabase client type (re-exported so consumers don't need @supabase/supabase-js directly)
export type { SupabaseClient, User } from "@supabase/supabase-js";

// Database type helpers
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "./database.types";

// Named row types — import directly in app code
export type {
  Profile,
  ProfileInsert,
  ProfileUpdate,
  Waitlist,
  WaitlistInsert,
  WaitlistUpdate,
  AiRateLimit,
  AiRateLimitInsert,
  AiRateLimitUpdate,
  UserRole,
  Group,
  GroupInsert,
  GroupUpdate,
  GroupMember,
  GroupMemberInsert,
  GroupMemberUpdate,
  Expense,
  ExpenseInsert,
  ExpenseUpdate,
  ExpenseParticipant,
  ExpenseParticipantInsert,
  ExpenseParticipantUpdate,
  ExpensePayer,
  ExpensePayerInsert,
  ExpensePayerUpdate,
  Payment,
  PaymentInsert,
  PaymentUpdate,
  UserPaymentProfile,
  UserPaymentProfileInsert,
  UserPaymentProfileUpdate,
  ExpenseItem,
  ExpenseItemInsert,
  ExpenseItemUpdate,
  ExpenseItemParticipant,
  ExpenseItemParticipantInsert,
  ExpenseItemParticipantUpdate,
} from "./database.types";
