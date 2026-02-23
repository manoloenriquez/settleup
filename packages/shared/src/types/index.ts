// ---------------------------------------------------------------------------
// NOTE: Domain entity types (Profile, Waitlist, UserRole) live in
// @template/supabase — they are generated from the DB schema.
// This file contains only framework-agnostic utility types.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Generic API response wrappers
// ---------------------------------------------------------------------------

export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = { data: null; error: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginatedResponse<T> = {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/** Make specific keys required on a type */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Make every key optional recursively */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
