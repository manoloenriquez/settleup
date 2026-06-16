-- =============================================================================
-- Phase 2.1: Add role column to group_members
--
-- Introduces a 'role' field ('owner' | 'member') to group_members.
-- The group creator (owner_user_id) becomes 'owner'; all other members
-- are 'member' by default.
--
-- Also adds a convenience index for role-based lookups.
-- =============================================================================

-- Add role column with a safe default so existing rows don't violate NOT NULL
ALTER TABLE settleup.group_members
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'member'));

-- Backfill: promote existing linked owner members to 'owner' role
UPDATE settleup.group_members gm
SET role = 'owner'
FROM settleup.groups g
WHERE g.id = gm.group_id
  AND g.owner_user_id IS NOT NULL
  AND g.owner_user_id = gm.user_id;

-- Index for role-based queries (e.g. finding all owners of a group)
CREATE INDEX group_members_role_idx
  ON settleup.group_members (group_id, role);
