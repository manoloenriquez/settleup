// ---------------------------------------------------------------------------
// App metadata
// ---------------------------------------------------------------------------

export const APP_NAME = "SettleUp Lite" as const;
export const APP_VERSION = "0.1.0" as const;

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
  PAYMENT_SETTINGS: "/account/payment",
  GROUP_INSIGHTS: "/groups/:groupId/insights",
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
  SOCIAL_LOGIN: false,
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
