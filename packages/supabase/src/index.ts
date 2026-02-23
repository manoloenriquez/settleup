// Clients
export { createBrowserClient } from "./browser";
export { createServerClient, type CookieAdapter } from "./server";
export { createMobileClient } from "./mobile";

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
  UserRole,
} from "./database.types";
