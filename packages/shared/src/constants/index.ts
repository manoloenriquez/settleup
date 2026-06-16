// ---------------------------------------------------------------------------
// App metadata
// ---------------------------------------------------------------------------

export const APP_NAME = "SettleUp" as const;
export const APP_VERSION = "0.1.0" as const;
export const BETA_SUPPORT_EMAIL = "hello@settleup.app" as const;

// ---------------------------------------------------------------------------
// Navigation routes — keep in sync across web and mobile
// ---------------------------------------------------------------------------

export const ROUTES = {
  HOME: "/",
  WAITLIST: "/waitlist",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  DASHBOARD: "/dashboard",
  ADMIN: "/admin",
  SETTINGS: "/settings",
  GROUPS: "/groups",
  GROUP_NEW: "/groups/new",
  ACCOUNT: "/account",
  PAYMENT_SETTINGS: "/account/payment",
  GROUP_INSIGHTS: "/groups/:groupId/insights",
  PRIVACY: "/privacy",
  TERMS: "/terms",
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];

// ---------------------------------------------------------------------------
// API / pagination
// ---------------------------------------------------------------------------

export const API_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// ---------------------------------------------------------------------------
// Feature flags (replace with a proper flag service in production)
// ---------------------------------------------------------------------------

export const FEATURE_FLAGS = {
  SOCIAL_LOGIN: true,
  BILLING: false,
  LLM_ENABLED: false, // toggled via LLM_ENABLED env var at runtime
} as const;

// ---------------------------------------------------------------------------
// AI limits
// ---------------------------------------------------------------------------

export const AI_LIMITS = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  RATE_LIMIT_PER_MINUTE: 10,
  MAX_CONVERSATION_MESSAGES: 20,
  MAX_RECEIPT_LINE_ITEMS: 100,
} as const;

// ---------------------------------------------------------------------------
// Expense categories
// ---------------------------------------------------------------------------

export const DEFAULT_EXPENSE_CATEGORIES = [
  { slug: "food-drinks", name: "Food & Drinks", icon: "utensils", color: "#ef4444", sort_order: 10 },
  { slug: "groceries", name: "Groceries", icon: "shopping-basket", color: "#10b981", sort_order: 20 },
  { slug: "transport", name: "Transport", icon: "car", color: "#3b82f6", sort_order: 30 },
  { slug: "lodging", name: "Lodging", icon: "bed", color: "#8b5cf6", sort_order: 40 },
  { slug: "activities", name: "Activities", icon: "ticket", color: "#f59e0b", sort_order: 50 },
  { slug: "shopping", name: "Shopping", icon: "shopping-bag", color: "#ec4899", sort_order: 60 },
  { slug: "supplies", name: "Supplies", icon: "package", color: "#14b8a6", sort_order: 70 },
  { slug: "fees", name: "Fees", icon: "receipt", color: "#64748b", sort_order: 80 },
  { slug: "other", name: "Other", icon: "circle-ellipsis", color: "#6b7280", sort_order: 90 },
] as const;

export type DefaultExpenseCategorySlug = (typeof DEFAULT_EXPENSE_CATEGORIES)[number]["slug"];

/** Fallback color for new/uncategorized expense categories (matches "Other"). */
export const DEFAULT_CATEGORY_COLOR = "#6b7280";
