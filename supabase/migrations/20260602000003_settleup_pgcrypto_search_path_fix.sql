-- Supabase installs pgcrypto helpers in the extensions schema on cloud projects.
-- Keep security-definer search paths explicit while allowing gen_random_bytes().

ALTER FUNCTION settleup.create_group_with_owner(TEXT)
  SET search_path = settleup, extensions;

ALTER FUNCTION settleup.rotate_member_share_token(UUID)
  SET search_path = settleup, extensions;

ALTER FUNCTION settleup.regenerate_invite_code(UUID)
  SET search_path = settleup, extensions;
