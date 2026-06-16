-- Account deletion should remove groups owned by the deleted user.
-- Linked member rows in groups owned by other users still use ON DELETE SET NULL.

ALTER TABLE settleup.groups
  DROP CONSTRAINT IF EXISTS groups_owner_user_id_fkey;

ALTER TABLE settleup.groups
  ADD CONSTRAINT groups_owner_user_id_fkey
  FOREIGN KEY (owner_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
