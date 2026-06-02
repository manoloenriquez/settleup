-- Tighten RPC/helper function execute grants for private beta.
-- Public share-link RPCs remain callable by anon/authenticated.

CREATE INDEX IF NOT EXISTS expense_categories_created_by_user_idx
  ON settleup.expense_categories (created_by_user_id);

REVOKE ALL ON FUNCTION settleup.apply_expense_category_default() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.touch_expense_category_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.slugify_category_name(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.check_expense_member_group() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.check_item_sum() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.check_participant_sum() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.check_payer_sum() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.check_payment_member_group() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.generate_unique_slug(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settleup.set_group_share_token() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION settleup.claim_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.claim_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.create_group_with_owner(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_group_with_owner(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.get_creditor_profiles(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_creditor_profiles(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.get_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_dashboard_summary() TO authenticated;

REVOKE ALL ON FUNCTION settleup.get_groups_with_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_groups_with_stats() TO authenticated;

REVOKE ALL ON FUNCTION settleup.get_member_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_member_balances(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.is_group_admin_or_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.is_group_admin_or_owner(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.join_group_by_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.join_group_by_invite(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.promote_member(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.promote_member(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.regenerate_invite_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.regenerate_invite_code(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.rename_group(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.rename_group(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.rename_member(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.rename_member(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.rotate_member_share_token(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.rotate_member_share_token(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.user_group_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.user_group_ids() TO authenticated;

REVOKE ALL ON FUNCTION settleup.record_payment(UUID, UUID, UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.record_payment(UUID, UUID, UUID, BIGINT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.undo_last_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.undo_last_payment(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.undo_last_payment_for_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.undo_last_payment_for_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.create_expense_category(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_expense_category(UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.update_expense_category(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.update_expense_category(UUID, TEXT, TEXT, TEXT, INT) TO authenticated;

REVOKE ALL ON FUNCTION settleup.delete_expense_category(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.delete_expense_category(UUID) TO authenticated;

REVOKE ALL ON FUNCTION settleup.create_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_expense(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION settleup.create_itemized_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_itemized_expense(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION settleup.update_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.update_expense(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION settleup.update_itemized_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.update_itemized_expense(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION settleup.get_friend_view(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION settleup.get_group_overview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO anon, authenticated;
