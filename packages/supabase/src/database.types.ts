/**
 * Hand-written to match supabase/migrations/*.sql.
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
  settleup: {
    Tables: {
      groups: {
        Row: {
          id: string;
          name: string;
          owner_user_id: string | null;
          invite_code: string;
          is_archived: boolean;
          share_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_user_id?: string | null;
          invite_code?: string;
          is_archived?: boolean;
          share_token?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_user_id?: string | null;
          invite_code?: string;
          is_archived?: boolean;
          share_token?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          display_name: string;
          slug: string;
          share_token: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          display_name: string;
          slug: string;
          share_token: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          display_name?: string;
          slug?: string;
          share_token?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          item_name: string;
          amount_cents: number;
          notes: string | null;
          created_by_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          item_name: string;
          amount_cents: number;
          notes?: string | null;
          created_by_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          item_name?: string;
          amount_cents?: number;
          notes?: string | null;
          created_by_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_participants: {
        Row: {
          expense_id: string;
          member_id: string;
          share_cents: number;
        };
        Insert: {
          expense_id: string;
          member_id: string;
          share_cents: number;
        };
        Update: {
          expense_id?: string;
          member_id?: string;
          share_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expense_participants_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_participants_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_payers: {
        Row: {
          expense_id: string;
          member_id: string;
          paid_cents: number;
        };
        Insert: {
          expense_id: string;
          member_id: string;
          paid_cents: number;
        };
        Update: {
          expense_id?: string;
          member_id?: string;
          paid_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expense_payers_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_payers_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          group_id: string;
          amount_cents: number;
          status: string;
          from_member_id: string | null;
          to_member_id: string | null;
          created_by_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          amount_cents: number;
          status?: string;
          from_member_id?: string | null;
          to_member_id?: string | null;
          created_by_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          amount_cents?: number;
          status?: string;
          from_member_id?: string | null;
          to_member_id?: string | null;
          created_by_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      user_payment_profiles: {
        Row: {
          user_id: string;
          payer_display_name: string | null;
          gcash_name: string | null;
          gcash_number: string | null;
          gcash_qr_url: string | null;
          bank_name: string | null;
          bank_account_name: string | null;
          bank_account_number: string | null;
          bank_qr_url: string | null;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          payer_display_name?: string | null;
          gcash_name?: string | null;
          gcash_number?: string | null;
          gcash_qr_url?: string | null;
          bank_name?: string | null;
          bank_account_name?: string | null;
          bank_account_number?: string | null;
          bank_qr_url?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          payer_display_name?: string | null;
          gcash_name?: string | null;
          gcash_number?: string | null;
          gcash_qr_url?: string | null;
          bank_name?: string | null;
          bank_account_name?: string | null;
          bank_account_number?: string | null;
          bank_qr_url?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_payment_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_friend_view: {
        Args: { p_share_token: string };
        Returns: Json;
      };
      get_group_overview: {
        Args: { p_share_token: string };
        Returns: Json;
      };
      get_groups_with_stats: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_member_balances: {
        Args: { p_group_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Convenience helpers — public schema
// ---------------------------------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

// ---------------------------------------------------------------------------
// Convenience helpers — settleup schema
// ---------------------------------------------------------------------------

export type SettleUpTables<T extends keyof Database["settleup"]["Tables"]> =
  Database["settleup"]["Tables"][T]["Row"];

export type SettleUpTablesInsert<T extends keyof Database["settleup"]["Tables"]> =
  Database["settleup"]["Tables"][T]["Insert"];

export type SettleUpTablesUpdate<T extends keyof Database["settleup"]["Tables"]> =
  Database["settleup"]["Tables"][T]["Update"];

// ---------------------------------------------------------------------------
// Named row types — public schema
// ---------------------------------------------------------------------------

export type Profile = Tables<"profiles">;
export type ProfileInsert = TablesInsert<"profiles">;
export type ProfileUpdate = TablesUpdate<"profiles">;

export type Waitlist = Tables<"waitlist">;
export type WaitlistInsert = TablesInsert<"waitlist">;
export type WaitlistUpdate = TablesUpdate<"waitlist">;

export type UserRole = Enums<"user_role">;

// ---------------------------------------------------------------------------
// Named row types — settleup schema
// ---------------------------------------------------------------------------

export type Group = SettleUpTables<"groups">;
export type GroupInsert = SettleUpTablesInsert<"groups">;
export type GroupUpdate = SettleUpTablesUpdate<"groups">;

export type GroupMember = SettleUpTables<"group_members">;
export type GroupMemberInsert = SettleUpTablesInsert<"group_members">;
export type GroupMemberUpdate = SettleUpTablesUpdate<"group_members">;

export type Expense = SettleUpTables<"expenses">;
export type ExpenseInsert = SettleUpTablesInsert<"expenses">;
export type ExpenseUpdate = SettleUpTablesUpdate<"expenses">;

export type ExpenseParticipant = SettleUpTables<"expense_participants">;
export type ExpenseParticipantInsert = SettleUpTablesInsert<"expense_participants">;
export type ExpenseParticipantUpdate = SettleUpTablesUpdate<"expense_participants">;

export type ExpensePayer = SettleUpTables<"expense_payers">;
export type ExpensePayerInsert = SettleUpTablesInsert<"expense_payers">;
export type ExpensePayerUpdate = SettleUpTablesUpdate<"expense_payers">;

export type Payment = SettleUpTables<"payments">;
export type PaymentInsert = SettleUpTablesInsert<"payments">;
export type PaymentUpdate = SettleUpTablesUpdate<"payments">;

export type UserPaymentProfile = SettleUpTables<"user_payment_profiles">;
export type UserPaymentProfileInsert = SettleUpTablesInsert<"user_payment_profiles">;
export type UserPaymentProfileUpdate = SettleUpTablesUpdate<"user_payment_profiles">;
