import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { emailSchema, passwordSchema, signInSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Profile } from "@template/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthContextValue = {
  /** Supabase session — null when signed out */
  session: Session | null;
  /** Supabase auth user — null when signed out */
  user: User | null;
  /** DB profile row — null when signed out or not yet loaded */
  profile: Profile | null;
  /**
   * True until the first onAuthStateChange event has been processed.
   * Use this to show a splash/loading screen before navigating.
   */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<ApiResponse<void>>;
  signUp: (email: string, password: string) => Promise<ApiResponse<void>>;
  signOut: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Start loading=true; set to false after the first auth event is resolved.
  const [loading, setLoading] = useState(true);
  const initialised = useRef(false);

  // -------------------------------------------------------------------------
  // Profile fetcher (called outside the onAuthStateChange callback to keep
  // the callback synchronous, per Supabase docs).
  // -------------------------------------------------------------------------

  const loadProfile = useCallback((userId: string) => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        setProfile(data ?? null);
      })
      .catch(() => setProfile(null))
      .finally(() => {
        if (!initialised.current) {
          setLoading(false);
          initialised.current = true;
        }
      });
  }, []);

  // -------------------------------------------------------------------------
  // Auth state listener
  // -------------------------------------------------------------------------

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        // Trigger async profile load — callback itself stays synchronous.
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        // If this is the first event and there's no session, we're done loading.
        if (!initialised.current) {
          setLoading(false);
          initialised.current = true;
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // -------------------------------------------------------------------------
  // Auth methods
  // -------------------------------------------------------------------------

  async function signIn(email: string, password: string): Promise<ApiResponse<void>> {
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) return { data: null, error: error.message };

    // On success onAuthStateChange fires → session + profile update + RouteGuard navigates.
    return { data: undefined, error: null };
  }

  async function signUp(email: string, password: string): Promise<ApiResponse<void>> {
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      return { data: null, error: emailResult.error.issues[0]?.message ?? "Invalid email." };
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      return {
        data: null,
        error: passwordResult.error.issues[0]?.message ?? "Invalid password.",
      };
    }

    const { error } = await supabase.auth.signUp({
      email: emailResult.data,
      password,
    });

    if (error) return { data: null, error: error.message };

    // If email confirmation is disabled (local dev), onAuthStateChange fires with
    // SIGNED_IN and RouteGuard navigates automatically.
    // If confirmation is required, the caller should show a "check your email" state.
    return { data: undefined, error: null };
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    // onAuthStateChange fires with SIGNED_OUT → session/profile cleared → RouteGuard navigates.
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
