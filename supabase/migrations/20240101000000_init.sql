-- =============================================================================
-- Initial schema
-- prototype-template
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- ---------------------------------------------------------------------------
-- profiles
-- 1:1 with auth.users — created automatically via trigger on signup.
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id          UUID             PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT             NOT NULL,
  full_name   TEXT,
  role        public.user_role NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE public.waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  approved    BOOLEAN     NOT NULL DEFAULT false,
  approved_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Helper: public.is_admin()
--
-- SECURITY DEFINER avoids infinite recursion: RLS policies on `profiles`
-- call this function, which reads `profiles` — running as the definer
-- (postgres superuser) it bypasses RLS for that internal read.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.profiles
    WHERE  id   = auth.uid()
    AND    role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: own row OR admin sees all
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- UPDATE own row (role-change guarded by trigger below)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- UPDATE any row — admins only (includes role changes)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No public INSERT — profiles are created by the trigger (SECURITY DEFINER).
-- No public DELETE — deletion cascades from auth.users.

-- ---------------------------------------------------------------------------
-- Trigger: block non-admins from elevating their own role
--
-- This is a defence-in-depth layer on top of RLS.  Even if a policy bug
-- allowed the UPDATE to reach the DB, the trigger rejects the role change.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ---------------------------------------------------------------------------
-- RLS: waitlist
-- ---------------------------------------------------------------------------

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- INSERT: anyone — including anonymous visitors — can join the waitlist
CREATE POLICY "waitlist_insert"
  ON public.waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SELECT / UPDATE / DELETE: admins only
CREATE POLICY "waitlist_select_admin"
  ON public.waitlist FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "waitlist_update_admin"
  ON public.waitlist FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "waitlist_delete_admin"
  ON public.waitlist FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Trigger: auto-create profile row when a new auth user signs up
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
