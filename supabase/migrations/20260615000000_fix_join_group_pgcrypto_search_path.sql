-- Fix: joining a group by invite code failed with
--   "function gen_random_bytes(integer) does not exist"
--
-- settleup.join_group_by_invite() generates a member share_token via
-- encode(gen_random_bytes(16), 'base64'), but pgcrypto lives in the `extensions`
-- schema on Supabase cloud and the function pins `SET search_path = settleup`,
-- hiding it. The earlier pgcrypto search_path fix (20260602000003) patched
-- create_group_with_owner / rotate_member_share_token / regenerate_invite_code
-- but missed join_group_by_invite. Add `extensions` to its search_path to match.

ALTER FUNCTION settleup.join_group_by_invite(TEXT)
  SET search_path = settleup, extensions;
