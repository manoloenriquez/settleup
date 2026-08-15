-- create_group_with_owner builds the owner's share token with
-- gen_random_bytes(), a pgcrypto helper that Supabase installs in the
-- `extensions` schema. 20260602000003 had already patched the original
-- (TEXT) overload to `search_path = settleup, extensions` for exactly that
-- reason, but 20260814090000 dropped that overload and recreated the
-- function as (TEXT, UUID) with `SET search_path = settleup` — silently
-- reverting the fix and making every group creation fail with
-- "function gen_random_bytes(integer) does not exist".
--
-- Restore the extensions schema on the search path for the new signature.
-- (Verified against the live database: the recreated function failed group
-- creation until this ALTER was applied.)

ALTER FUNCTION settleup.create_group_with_owner(TEXT, UUID)
  SET search_path = settleup, extensions;
