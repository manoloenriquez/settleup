/**
 * Hand-written to match supabase/migrations/20240101000000_init.sql.
 *
 * Regenerate after schema changes:
 *   pnpm supabase gen types typescript --local \
 *     > packages/supabase/src/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          approved: boolean;
          approved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          approved?: boolean;
          approved_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          approved?: boolean;
          approved_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: "user" | "admin";
    };
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Convenience helpers — use these instead of Database["public"]["Tables"][T]
// ---------------------------------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

// ---------------------------------------------------------------------------
// Named row types — import these directly in application code
// ---------------------------------------------------------------------------

export type Profile = Tables<"profiles">;
export type ProfileInsert = TablesInsert<"profiles">;
export type ProfileUpdate = TablesUpdate<"profiles">;

export type Waitlist = Tables<"waitlist">;
export type WaitlistInsert = TablesInsert<"waitlist">;
export type WaitlistUpdate = TablesUpdate<"waitlist">;

export type UserRole = Enums<"user_role">;
