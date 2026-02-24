-- Add user_id to group_members for linking real users to group members.
-- Partial unique index ensures one user can only be linked once per group.

ALTER TABLE settleup.group_members
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX group_members_group_user_unique
  ON settleup.group_members (group_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX group_members_user_id_idx
  ON settleup.group_members (user_id) WHERE user_id IS NOT NULL;
