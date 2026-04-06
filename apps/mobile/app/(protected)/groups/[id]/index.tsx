import { useState } from "react";
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useMembersWithBalances, useCreditorProfiles } from "@/hooks/useBalances";
import { useExpenses, useDeleteExpense, useUpdateExpense } from "@/hooks/useExpenses";
import { useGroupActivity } from "@/hooks/useActivity";
import { useGroups } from "@/hooks/useGroups";
import { useUndoLastPayment } from "@/hooks/usePayments";
import { useMembers } from "@/hooks/useMembers";
import { useClaimMember } from "@/hooks/useCollaboration";
import { useAuth } from "@/context/AuthContext";
import { DebtSummary } from "@/components/groups/DebtSummary";
import { MemberRow } from "@/components/groups/MemberRow";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { ActivityTimeline } from "@/components/groups/ActivityTimeline";
import { SegmentedControl, Card } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { simplifyDebts, formatCents, parsePHPAmount } from "@template/shared";
import type { SimplifiedDebt } from "@template/shared";
import type { Expense } from "@template/supabase";

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

type Tab = "balances" | "expenses" | "activity";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("balances");
  const { user } = useAuth();

  const balancesQ = useMembersWithBalances(id);
  const creditorProfilesQ = useCreditorProfiles(id);
  const expensesQ = useExpenses(id);
  const activityQ = useGroupActivity(id);
  const deleteExpense = useDeleteExpense(id);
  const updateExpenseMut = useUpdateExpense(id);
  const undoPayment = useUndoLastPayment(id);

  // Edit expense modal state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === id);
  const membersQ = useMembers(id);
  const claimMember = useClaimMember(id);

  // Unlinked members the current user might want to claim
  const isMemberLinked = (membersQ.data ?? []).some((m) => m.user_id === user?.id);
  const unlinkedMembers = isMemberLinked
    ? [] // already linked — no need to prompt
    : (membersQ.data ?? []).filter((m) => m.user_id === null && m.role !== "owner");

  async function handleShareGroup() {
    if (!group?.share_token || !WEB_ORIGIN) {
      Alert.alert("Share not available", "Share link could not be generated.");
      return;
    }
    const url = `${WEB_ORIGIN}/g/${group.share_token}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      // User cancelled — no action needed
    }
  }

  async function handleCopyGroupSummary() {
    const members = balancesQ.data ?? [];
    if (members.length === 0) {
      Alert.alert("No data", "No balance data to copy.");
      return;
    }
    const debts = simplifyDebts(members);
    if (debts.length === 0) {
      await Clipboard.setStringAsync("All settled up! 🎉");
      Alert.alert("Copied", "Group summary copied to clipboard");
      return;
    }
    const lines = debts.map((d) => `${d.from_display_name} owes ${d.to_display_name} ${formatCents(d.amount_cents)}`);
    const text = `${group?.name ?? "Group"} Balances:\n${lines.join("\n")}`;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Group summary copied to clipboard");
  }

  function handleUndoPayment() {
    Alert.alert(
      "Undo Last Payment",
      "This will delete the most recent payment recorded for this group. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            undoPayment.mutate(undefined, {
              onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Failed to undo payment"),
            });
          },
        },
      ],
    );
  }

  const isLoading = balancesQ.isLoading || expensesQ.isLoading;
  const isRefreshing = balancesQ.isFetching || expensesQ.isFetching || activityQ.isFetching;

  function handleRefresh() {
    void balancesQ.refetch();
    void expensesQ.refetch();
    void activityQ.refetch();
  }

  function handleSettle(debt: SimplifiedDebt) {
    router.push({
      pathname: "/groups/[id]/settle-up",
      params: { id, fromId: debt.from_member_id, toId: debt.to_member_id, amount: String(debt.amount_cents) },
    });
  }

  function openEditExpense(expense: Expense): void {
    setEditingExpense(expense);
    setEditName(expense.item_name);
    setEditAmount(formatCents(Math.abs(expense.amount_cents)).replace(/[₱,]/g, ""));
  }

  function handleSaveEdit(): void {
    if (!editingExpense) return;
    const amountCents = parsePHPAmount(editAmount);
    if (!amountCents || amountCents <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    const allMemberIds = (membersQ.data ?? []).map((m) => m.id);
    updateExpenseMut.mutate(
      {
        expenseId: editingExpense.id,
        itemName: editName.trim(),
        amountCents,
        participantIds: allMemberIds,
        payers: [{ memberId: allMemberIds[0] ?? "", paidCents: amountCents }],
      },
      {
        onSuccess: (res) => {
          if (res.error) {
            Alert.alert("Error", res.error);
            return;
          }
          setEditingExpense(null);
        },
        onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Failed to update"),
      },
    );
  }

  const segments: { value: Tab; label: string }[] = [
    { value: "balances", label: "Balances" },
    { value: "expenses", label: "Expenses" },
    { value: "activity", label: "Activity" },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: group?.name ?? "Group",
          headerRight: () => (
            <View style={styles.headerBtns}>
              <TouchableOpacity onPress={() => router.push(`/(protected)/groups/${id}/overview`)} hitSlop={8}>
                <Ionicons name="eye-outline" size={20} color={colors.gray600} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCopyGroupSummary} hitSlop={8}>
                <Ionicons name="copy-outline" size={20} color={colors.gray600} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUndoPayment} hitSlop={8}>
                <Ionicons name="arrow-undo-outline" size={20} color={colors.gray600} />
              </TouchableOpacity>
              {WEB_ORIGIN ? (
                <TouchableOpacity onPress={handleShareGroup} hitSlop={8}>
                  <Ionicons name="share-outline" size={20} color={colors.gray600} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => router.push(`/(protected)/groups/${id}/settings`)} hitSlop={8}>
                <Ionicons name="settings-outline" size={20} color={colors.gray600} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefreshing && !isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {/* Balance Stats */}
          {(() => {
            const members = balancesQ.data ?? [];
            const totalOwed = members.reduce((s, m) => s + m.owed_cents, 0);
            const pendingCount = members.filter((m) => m.net_cents < 0).length;
            const isSettled = totalOwed === 0;
            return (
              <View style={styles.statsRow}>
                <View style={[styles.statCard, isSettled ? styles.statCardGreen : styles.statCardAmber]}>
                  <Text style={[styles.statLabel, { color: isSettled ? colors.success : colors.warning }]}>Outstanding</Text>
                  <Text style={[styles.statValue, { color: isSettled ? "#065f46" : "#92400e" }]}>
                    {isSettled ? "Settled" : formatCents(totalOwed)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Members</Text>
                  <Text style={styles.statValue}>{members.length}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Pending</Text>
                  <Text style={[styles.statValue, pendingCount > 0 && { color: colors.warning }]}>{pendingCount}</Text>
                </View>
              </View>
            );
          })()}

          {/* Claim member banner */}
          {unlinkedMembers.length > 0 && (
            <View style={styles.claimBanner}>
              <Text style={styles.claimBannerTitle}>Are you one of these members?</Text>
              <Text style={styles.claimBannerSub}>
                Link your account to track your expenses automatically.
              </Text>
              <View style={styles.claimBannerList}>
                {unlinkedMembers.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.claimMemberBtn}
                    onPress={() => {
                      Alert.alert(
                        `Claim "${m.display_name}"?`,
                        "This will link this member to your account.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Claim",
                            onPress: () => claimMember.mutate(m.id, {
                              onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Failed to claim member"),
                            }),
                          },
                        ],
                      );
                    }}
                  >
                    <Text style={styles.claimMemberName}>{m.display_name}</Text>
                    <Text style={styles.claimMemberAction}>Claim →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Debt Summary */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>WHO OWES WHO</Text>
          </View>
          <DebtSummary members={balancesQ.data ?? []} creditorProfiles={creditorProfilesQ.data} onSettle={handleSettle} />

          {/* Segmented Tabs */}
          <View style={styles.segmentWrapper}>
            <SegmentedControl segments={segments} value={tab} onChange={setTab} />
          </View>

          {/* Tab Content */}
          {tab === "balances" && (
            <Card padding={0}>
              {(balancesQ.data ?? []).map((m, i) => (
                <View key={m.member_id}>
                  <MemberRow member={m} webOrigin={WEB_ORIGIN || undefined} />
                  {i < (balancesQ.data ?? []).length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </Card>
          )}

          {tab === "expenses" && (
            <ExpenseList
              expenses={expensesQ.data ?? []}
              onEdit={openEditExpense}
              onDelete={(expId) => deleteExpense.mutate(expId)}
            />
          )}

          {tab === "activity" && (
            <ActivityTimeline items={activityQ.data ?? []} />
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push(`/(protected)/groups/${id}/add-expense`)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.fabText}>Add Expense</Text>
      </TouchableOpacity>

      {/* Edit Expense Modal */}
      <Modal
        visible={editingExpense !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingExpense(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Expense</Text>
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Expense name"
              placeholderTextColor={colors.gray400}
            />
            <Text style={styles.modalLabel}>Amount</Text>
            <TextInput
              style={styles.modalInput}
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="0.00"
              placeholderTextColor={colors.gray400}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingExpense(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, updateExpenseMut.isPending && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={updateExpenseMut.isPending}
              >
                <Text style={styles.modalSaveText}>
                  {updateExpenseMut.isPending ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: 100 },

  headerBtns: { flexDirection: "row", gap: spacing.md },

  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.base },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardAmber: { backgroundColor: "#fef3c7", borderColor: colors.warning + "40" },
  statCardGreen: { backgroundColor: colors.successLight, borderColor: colors.success + "40" },
  statLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray400, marginBottom: 2, letterSpacing: 0.3 },
  statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },

  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },

  segmentWrapper: { marginVertical: spacing.base },

  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.base },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    left: 20,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: colors.white, fontWeight: fontWeight.bold, fontSize: fontSize.md },

  claimBanner: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  claimBannerTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary, marginBottom: 2 },
  claimBannerSub: { fontSize: fontSize.xs, color: colors.gray600, marginBottom: spacing.sm },
  claimBannerList: { gap: spacing.xs },
  claimMemberBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  claimMemberName: { fontSize: fontSize.sm, color: colors.gray900, fontWeight: fontWeight.medium },
  claimMemberAction: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: spacing.base },
  modalContent: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, width: "100%" },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900, marginBottom: spacing.base },
  modalLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600, marginBottom: 4 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: fontSize.md, color: colors.gray900, marginBottom: spacing.sm },
  modalBtns: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  modalCancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.base },
  modalCancelText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray500 },
  modalSaveBtn: { backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md },
  modalSaveText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.white },
});
