/**
 * Auth & admin guards for Next.js App Router.
 *
 * Two flavours of each guard:
 *
 *   require*()  — redirect variant.  Use in Server Components and layouts.
 *                 Calls Next.js redirect() so the browser receives a 307.
 *
 *   assert*()   — throw variant.  Use inside `"use server"` Server Actions
 *                 where you want to return a typed error to the caller
 *                 instead of an automatic redirect.
 *
 * Low-level helpers (get*) return null on failure — use when you want
 * to branch on auth state yourself.
 */

import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { Profile } from "@template/supabase";

// ---------------------------------------------------------------------------
// Low-level: return null on failure — no side-effects
// ---------------------------------------------------------------------------

/**
 * Returns the currently authenticated Supabase User, or null.
 * Always calls getUser() (validates JWT server-side) — never use getSession().
 */
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * Returns the profile row for the authenticated user, or null.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data ?? null;
}

// ---------------------------------------------------------------------------
// Redirect guards — for Server Components / layouts
// ---------------------------------------------------------------------------

/**
 * Asserts that a user is signed in.
 * Redirects to /sign-in if not authenticated.
 *
 * @example
 * // app/dashboard/page.tsx
 * export default async function DashboardPage() {
 *   const user = await requireAuth();
 *   ...
 * }
 */
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Asserts that the signed-in user has the `admin` role.
 * Redirects to /sign-in if not authenticated, /dashboard if not admin.
 *
 * Returns both the Supabase User and their Profile row so callers
 * don't need a second DB round-trip.
 *
 * @example
 * // app/admin/page.tsx
 * export default async function AdminPage() {
 *   const { user, profile } = await requireAdmin();
 *   ...
 * }
 */
export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return { user, profile };
}

// ---------------------------------------------------------------------------
// Throw guards — for Server Actions
// ---------------------------------------------------------------------------

class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Asserts that a user is signed in.
 * Throws an AuthError (UNAUTHENTICATED) if not — catch in your Server Action
 * and return an appropriate error response to the client.
 *
 * @example
 * // app/actions/profile.ts
 * "use server";
 * export async function updateProfile(data: ProfileUpdate): Promise<ApiResponse<void>> {
 *   try {
 *     const user = await assertAuth();
 *     ...
 *   } catch (e) {
 *     if (e instanceof AuthError) return { data: null, error: e.message };
 *     throw e;
 *   }
 * }
 */
export async function assertAuth() {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required.", "UNAUTHENTICATED");
  return user;
}

/**
 * Asserts that the signed-in user has the `admin` role.
 * Throws AuthError (UNAUTHENTICATED) if not signed in,
 * AuthError (FORBIDDEN) if signed in but not an admin.
 *
 * @example
 * // app/actions/admin.ts
 * "use server";
 * export async function approveWaitlist(id: string): Promise<ApiResponse<void>> {
 *   try {
 *     const { user } = await assertAdmin();
 *     ...
 *   } catch (e) {
 *     if (e instanceof AuthError) return { data: null, error: e.message };
 *     throw e;
 *   }
 * }
 */
export async function assertAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AuthError("Authentication required.", "UNAUTHENTICATED");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    throw new AuthError("Admin role required.", "FORBIDDEN");
  }

  return { user, profile };
}

// Re-export so callers can catch it with instanceof
export { AuthError };
