import { useState } from "react";
import { Alert, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useMembersWithBalances, useCreditorProfiles } from "@/hooks/useBalances";
import { useExpenses, useDeleteExpense, useUpdateExpense, useUpdateExpenseCustomSplit, useUpdateItemizedExpense, useExpenseTotals } from "@/hooks/useExpenses";
import { useGroupActivity } from "@/hooks/useActivity";
import { useGroups } from "@/hooks/useGroups";
import { usePendingPayments, useUndoLastPayment, useUndoLastPaymentForMember } from "@/hooks/usePayments";
import { useGroupRealtime } from "@/hooks/useGroupRealtime";
import { useMembers } from "@/hooks/useMembers";
import { useCategories } from "@/hooks/useCategories";
import { useClaimMember } from "@/hooks/useCollaboration";
import { useAuth } from "@/context/AuthContext";
import { DebtSummary } from "@/components/groups/DebtSummary";
import { PendingPaymentsCard } from "@/components/groups/PendingPaymentsCard";
import { CommentThreadModal } from "@/components/groups/CommentThreadModal";
import { MemberRow } from "@/components/groups/MemberRow";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { ActivityTimeline } from "@/components/groups/ActivityTimeline";
import { CategoryPicker } from "@/components/groups/CategoryPicker";
import { SegmentedControl, Card, ErrorBanner, SkeletonCard, useToast, Avatar } from "@/components/ui";
import type { ExpenseWithDetails } from "@/services/expenses";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { simplifyDebts, formatCents, parsePHPAmount } from "@template/shared";
import type { MemberBalance, SimplifiedDebt } from "@template/shared";

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

type Tab = "expenses" | "balances" | "charts";

function scalePositiveAmounts(weights: number[], totalCents: number): number[] | null {
  if (weights.length === 0) return [];
  if (weights.some((weight) => weight <= 0)) return null;
  if (totalCents < weights.length) return null;
  if (weights.length === 1) return [totalCents];

  const allocations = new Array<number>(weights.length).fill(1);
  const remaining = totalCents - weights.length;
  if (remaining === 0) return allocations;

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const scaled = weights.map((weight, index) => {
    const raw = weight * remaining;
    return {
      index,
      base: Math.floor(raw / weightTotal),
      remainder: raw % weightTotal,
    };
  });

  for (const item of scaled) {
    allocations[item.index] = (allocations[item.index] ?? 0) + item.base;
  }

  let leftover = totalCents - allocations.reduce((sum, amount) => sum + amount, 0);
  const byRemainder = [...scaled].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < byRemainder.length && leftover > 0; i += 1) {
    const current = byRemainder[i];
    if (!current) break;
    allocations[current.index] = (allocations[current.index] ?? 0) + 1;
    leftover -= 1;
  }

  return allocations;
}

function isEqualSplit(expense: ExpenseWithDetails): boolean {
  if ((expense.items?.length ?? 0) > 0 || expense.participants.length === 0) {
    return false;
  }

  const shares = expense.participants
    .map((participant) => participant.share_cents)
    .sort((a, b) => a - b);

  return shares[shares.length - 1]! - shares[0]! <= 1;
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("expenses");
  const { user } = useAuth();
  const toast = useToast();

  const balancesQ = useMembersWithBalances(id);
  const creditorProfilesQ = useCreditorProfiles(id);
  const expensesQ = useExpenses(id);
  const totalsQ = useExpenseTotals(id);
  const expenses = expensesQ.data?.pages.flatMap((p) => p.data) ?? [];
  const activityQ = useGroupActivity(id);
  const deleteExpense = useDeleteExpense(id);
  const updateExpenseMut = useUpdateExpense(id);
  const updateCustomExpenseMut = useUpdateExpenseCustomSplit(id);
  const updateItemizedExpenseMut = useUpdateItemizedExpense(id);
  const undoPayment = useUndoLastPayment(id);
  const undoMemberPayment = useUndoLastPaymentForMember(id);
  const pendingPaymentsQ = usePendingPayments(id);
  useGroupRealtime(id);

  // Edit expense modal state
  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [commentsExpense, setCommentsExpense] = useState<ExpenseWithDetails | null>(null);
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === id);
  const membersQ = useMembers(id);
  const categoriesQ = useCategories(id);
  const claimMember = useClaimMember(id);

  // Unlinked members the current user might want to claim
  const isMemberLinked = (membersQ.data ?? []).some((m) => m.user_id === user?.id);
  const unlinkedMembers = isMemberLinked
    ? [] // already linked — no need to prompt
    : (membersQ.data ?? []).filter((m) => m.user_id === null && m.role !== "owner");

  async function handleShareGroup() {
    if (!WEB_ORIGIN) {
      toast.error(
        __DEV__
          ? "Share links need the web app URL. Set EXPO_PUBLIC_WEB_URL in apps/mobile/.env."
          : "Share links aren't available in this build.",
      );
      return;
    }
    if (!group?.share_token) {
      toast.error("Share link could not be generated.");
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
      toast.info("No balance data to copy.");
      return;
    }
    const debts = simplifyDebts(members);
    if (debts.length === 0) {
      await Clipboard.setStringAsync("All settled up! 🎉");
      toast.success("Group summary copied to clipboard");
      return;
    }
    const lines = debts.map((d) => `${d.from_display_name} owes ${d.to_display_name} ${formatCents(d.amount_cents)}`);
    const text = `${group?.name ?? "Group"} Balances:\n${lines.join("\n")}`;
    await Clipboard.setStringAsync(text);
    toast.success("Group summary copied to clipboard");
  }

  function handleUndoPayment() {
    Alert.alert(
      "Undo My Last Payment",
      "This will delete the most recent payment you recorded in this group. Payments recorded by others are not affected. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            undoPayment.mutate(undefined, {
              onSuccess: (res) => {
                if (res.error) toast.error(res.error);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to undo payment"),
            });
          },
        },
      ],
    );
  }

  function handleUndoMemberPayment(member: MemberBalance) {
    Alert.alert(
      "Undo Last Payment",
      `Undo the most recent payment from ${member.display_name}? You can undo payments you recorded, or any payment if you're a group admin.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            undoMemberPayment.mutate(member.member_id, {
              onSuccess: (res) => {
                if (res.error) toast.error(res.error);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to undo payment"),
            });
          },
        },
      ],
    );
  }

  function handleGroupActions() {
    Alert.alert("Group actions", undefined, [
      { text: "Public overview", onPress: () => router.push(`/(protected)/groups/${id}/overview`) },
      { text: "Copy summary", onPress: () => void handleCopyGroupSummary() },
      { text: "Undo my last payment", style: "destructive", onPress: handleUndoPayment },
      { text: "Share group", onPress: () => void handleShareGroup() },
      { text: "Settings", onPress: () => router.push(`/(protected)/groups/${id}/settings`) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const isLoading = balancesQ.isLoading || expensesQ.isLoading;
  const isRefreshing = balancesQ.isFetching || expensesQ.isFetching || activityQ.isFetching;

  function handleRefresh() {
    void balancesQ.refetch();
    void expensesQ.refetch();
    void totalsQ.refetch();
    void activityQ.refetch();
    void pendingPaymentsQ.refetch();
  }

  function handleSettle(debt: SimplifiedDebt) {
    router.push({
      pathname: "/groups/[id]/settle-up",
      params: { id, fromId: debt.from_member_id, toId: debt.to_member_id, amount: String(debt.amount_cents) },
    });
  }

  function openEditExpense(expense: ExpenseWithDetails): void {
    if (expense.amount_cents < 0) {
      toast.info("Credits are not editable from this screen yet.");
      return;
    }

    setEditingExpense(expense);
    setEditName(expense.item_name);
    setEditAmount(formatCents(Math.abs(expense.amount_cents)).replace(/[₱,]/g, ""));
    setEditCategoryId(expense.category_id);
  }

  function handleSaveEdit(): void {
    if (!editingExpense) return;
    const amountCents = parsePHPAmount(editAmount);
    if (!amountCents || amountCents <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const onSuccess = (res: { error: string | null }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setEditingExpense(null);
      toast.success("Expense updated");
    };
    const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update");

    const payerAmounts = scalePositiveAmounts(
      editingExpense.payers.map((payer) => payer.paid_cents),
      amountCents,
    );

    if (!payerAmounts) {
      toast.error("Amount is too small to preserve payer contributions.");
      return;
    }

    if ((editingExpense.items?.length ?? 0) > 0) {
      const items = editingExpense.items ?? [];
      const itemAmounts = scalePositiveAmounts(
        items.map((item) => item.amount_cents),
        amountCents,
      );

      if (!itemAmounts) {
        toast.error("Amount is too small to preserve itemized shares.");
        return;
      }

      updateItemizedExpenseMut.mutate(
        {
          expenseId: editingExpense.id,
          expenseName: editName.trim(),
          amountCents,
          categoryId: editCategoryId,
          payers: editingExpense.payers.map((payer, index) => ({
            memberId: payer.member_id,
            paidCents: payerAmounts[index]!,
          })),
          lineItems: items.map((item, index) => ({
            name: item.name,
            amountCents: itemAmounts[index]!,
            participantIds: item.item_participants.map((participant) => participant.member_id),
          })),
        },
        { onSuccess, onError },
      );
      return;
    }

    const participantIds = editingExpense.participants.map((participant) => participant.member_id);
    if (isEqualSplit(editingExpense)) {
      updateExpenseMut.mutate(
        {
          expenseId: editingExpense.id,
          itemName: editName.trim(),
          amountCents,
          categoryId: editCategoryId,
          participantIds,
          payers: editingExpense.payers.map((payer, index) => ({
            memberId: payer.member_id,
            paidCents: payerAmounts[index]!,
          })),
        },
        { onSuccess, onError },
      );
      return;
    }

    const customSplitAmounts = scalePositiveAmounts(
      editingExpense.participants.map((participant) => participant.share_cents),
      amountCents,
    );
    if (!customSplitAmounts) {
      toast.error("Amount is too small to preserve custom splits.");
      return;
    }

    updateCustomExpenseMut.mutate(
      {
        expenseId: editingExpense.id,
        itemName: editName.trim(),
        amountCents,
        categoryId: editCategoryId,
        customSplits: editingExpense.participants.map((participant, index) => ({
          memberId: participant.member_id,
          shareCents: customSplitAmounts[index]!,
        })),
        payers: editingExpense.payers.map((payer, index) => ({
          memberId: payer.member_id,
          paidCents: payerAmounts[index]!,
        })),
      },
      { onSuccess, onError },
    );
  }

  const segments: { value: Tab; label: string }[] = [
    { value: "expenses", label: "Expenses" },
    { value: "balances", label: "Balances" },
    { value: "charts", label: "Charts" },
  ];

  const currentMemberId =
    (membersQ.data ?? []).find((m) => m.user_id === user?.id)?.id ?? null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: group?.name ?? "Group",
          headerRight: () => (
            <View style={styles.headerBtns}>
              <TouchableOpacity onPress={handleGroupActions} hitSlop={8} accessibilityRole="button" accessibilityLabel="Group actions">
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.gray600} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {isLoading ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefreshing && !isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {(balancesQ.error || expensesQ.error || activityQ.error) && (
            <ErrorBanner
              message={
                (balancesQ.error instanceof Error ? balancesQ.error.message : null) ??
                (expensesQ.error instanceof Error ? expensesQ.error.message : null) ??
                (activityQ.error instanceof Error ? activityQ.error.message : null) ??
                "Couldn't load this group."
              }
              onRetry={() => {
                void balancesQ.refetch();
                void expensesQ.refetch();
    void totalsQ.refetch();
                void activityQ.refetch();
              }}
            />
          )}
          {/* Member avatar row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.avatarRow}
          >
            {(membersQ.data ?? []).map((m) => {
              const isYou = m.user_id === user?.id;
              return (
                <View key={m.id} style={styles.avatarItem}>
                  <View style={[styles.avatarRing, isYou && styles.avatarRingYou]}>
                    <Avatar name={m.display_name} size={46} />
                  </View>
                  <Text style={styles.avatarName} numberOfLines={1}>
                    {isYou ? "You" : m.display_name.split(" ")[0]}
                  </Text>
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.avatarItem}
              onPress={() => router.push(`/(protected)/groups/${id}/settings`)}
              accessibilityLabel="Add member"
            >
              <View style={styles.avatarAdd}>
                <Ionicons name="add" size={20} color={colors.gray400} />
              </View>
              <Text style={styles.avatarName}>Add</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Group balance card */}
          {(() => {
            const members = balancesQ.data ?? [];
            const totalOwed = members.reduce((s, m) => s + m.owed_cents, 0);
            const totalSpent = totalsQ.data?.positiveTotalCents ?? 0;
            const settledPct = totalSpent > 0 ? Math.max(0, Math.min(100, Math.round((1 - totalOwed / totalSpent) * 100))) : 100;
            const isSettled = totalOwed === 0;
            const myNet = members.find((m) => m.member_id === currentMemberId)?.net_cents ?? 0;
            const expenseCount = totalsQ.data?.count ?? expenses.length;
            return (
              <View style={styles.balanceCard}>
                <View style={styles.balanceTop}>
                  <View style={styles.balanceBody}>
                    <Text style={styles.balanceLabel}>Group balance</Text>
                    <Text style={[styles.balanceAmount, isSettled && { color: colors.success }]}>
                      {isSettled ? "All settled" : formatCents(totalOwed)}
                    </Text>
                    <Text style={styles.balanceSub}>
                      {myNet > 0
                        ? `You are owed ${formatCents(myNet)}`
                        : myNet < 0
                          ? `You owe ${formatCents(-myNet)}`
                          : "You’re settled up"}
                    </Text>
                  </View>
                  <View style={styles.balancePill}>
                    <Text style={styles.balancePillText}>
                      {expenseCount} expense{expenseCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.balanceTrack}>
                  <View style={[styles.balanceFill, { width: `${settledPct}%` }]} />
                </View>
                <Text style={styles.balancePct}>{settledPct}% settled</Text>
              </View>
            );
          })()}

          {/* Budget progress */}
          {group?.budget_cents != null && group.budget_cents > 0 && (() => {
            const spent = totalsQ.data?.positiveTotalCents ?? 0;
            const pct = Math.min(100, Math.round((spent / group.budget_cents) * 100));
            const over = spent > group.budget_cents;
            const warn = !over && pct >= 80;
            const barColor = over ? colors.danger : warn ? colors.warning : colors.primary;
            return (
              <View style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetLabel}>BUDGET</Text>
                  <Text style={[styles.budgetValue, over && { color: colors.danger }]}>
                    {formatCents(spent)} of {formatCents(group.budget_cents)}
                    {over ? " · over" : ` · ${pct}%`}
                  </Text>
                </View>
                <View
                  style={styles.budgetTrack}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: pct }}
                  accessibilityLabel="Budget used"
                >
                  <View style={[styles.budgetFill, { width: `${pct}%`, backgroundColor: barColor }]} />
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
                              onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to claim member"),
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

          {/* Pending friend-reported payments */}
          <PendingPaymentsCard
            groupId={id}
            pending={pendingPaymentsQ.data ?? []}
            members={membersQ.data ?? []}
            currentUserId={user?.id}
          />

          {/* Segmented Tabs */}
          <View style={styles.segmentWrapper}>
            <SegmentedControl segments={segments} value={tab} onChange={setTab} />
          </View>

          {/* Tab Content */}
          {tab === "expenses" && (
            <ExpenseList
              onComments={setCommentsExpense}
              expenses={expenses}
              hasMore={expensesQ.hasNextPage}
              loadingMore={expensesQ.isFetchingNextPage}
              onLoadMore={() => void expensesQ.fetchNextPage()}
              onEdit={openEditExpense}
              onDelete={(expId) =>
                deleteExpense.mutate(expId, {
                  onSuccess: (res) => {
                    if (res.error) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Expense deleted");
                  },
                  onError: () => toast.error("Failed to delete expense."),
                })
              }
            />
          )}

          {tab === "balances" && (
            <>
              <DebtSummary
                members={balancesQ.data ?? []}
                creditorProfiles={creditorProfilesQ.data}
                onSettle={handleSettle}
                groupName={group?.name}
                webOrigin={WEB_ORIGIN || undefined}
                currentMemberId={currentMemberId}
              />
              <View style={styles.tabSection}>
                <Card padding={0}>
                  {(balancesQ.data ?? []).map((m, i) => (
                    <View key={m.member_id}>
                      <MemberRow
                        member={m}
                        webOrigin={WEB_ORIGIN || undefined}
                        onUndoLastPayment={handleUndoMemberPayment}
                      />
                      {i < (balancesQ.data ?? []).length - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </Card>
              </View>
              <View style={styles.tabSection}>
                <ActivityTimeline items={activityQ.data ?? []} />
              </View>
            </>
          )}

          {tab === "charts" && (
            <TouchableOpacity
              style={styles.chartsCard}
              onPress={() => router.push(`/(protected)/groups/${id}/insights`)}
              activeOpacity={0.8}
            >
              <View style={styles.chartsIcon}>
                <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.chartsBody}>
                <Text style={styles.chartsTitle}>Spending insights</Text>
                <Text style={styles.chartsSub}>
                  Category breakdown, top spender, and an AI summary of this group’s spending.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push(`/(protected)/groups/${id}/add-expense`)}
        activeOpacity={0.85}
        accessibilityLabel="Add expense"
      >
        <Ionicons name="add" size={26} color={colors.white} />
      </TouchableOpacity>

      {/* Expense comments */}
      <CommentThreadModal
        expenseId={commentsExpense?.id ?? null}
        expenseName={commentsExpense?.item_name ?? ""}
        members={membersQ.data ?? []}
        currentUserId={user?.id}
        onClose={() => setCommentsExpense(null)}
      />

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
            <CategoryPicker categories={categoriesQ.data ?? []} selectedId={editCategoryId} onSelect={setEditCategoryId} />
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

  avatarRow: { gap: spacing.base, paddingBottom: spacing.xs, marginBottom: spacing.md },
  avatarItem: { alignItems: "center", gap: 4, width: 56 },
  avatarRing: { borderRadius: 28, padding: 2, borderWidth: 2, borderColor: colors.gray200 },
  avatarRingYou: { borderColor: colors.primary },
  avatarName: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: fontWeight.medium, maxWidth: 56 },
  avatarAdd: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.gray300,
    alignItems: "center",
    justifyContent: "center",
    margin: 2,
  },

  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.base,
  },
  balanceTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  balanceBody: { flex: 1, minWidth: 0 },
  balanceLabel: { fontSize: fontSize.base, color: colors.gray500, fontWeight: fontWeight.medium },
  balanceAmount: { fontSize: fontSize["3xl"], fontWeight: fontWeight.bold, color: colors.gray900, letterSpacing: -0.5, marginTop: 2, fontVariant: ["tabular-nums"] },
  balanceSub: { fontSize: fontSize.base, color: colors.gray500, marginTop: 2 },
  balancePill: { backgroundColor: colors.gray100, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  balancePillText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray600 },
  balanceTrack: { height: 8, borderRadius: borderRadius.full, backgroundColor: colors.gray100, overflow: "hidden", marginTop: spacing.md },
  balanceFill: { height: "100%", borderRadius: borderRadius.full, backgroundColor: colors.primary },
  balancePct: { fontSize: fontSize.xs, color: colors.gray400, marginTop: 4 },

  tabSection: { marginTop: spacing.base },

  chartsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  chartsIcon: { width: 44, height: 44, borderRadius: borderRadius.lg, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  chartsBody: { flex: 1, minWidth: 0 },
  chartsTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  chartsSub: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 2 },

  budgetCard:{ backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.base },
  budgetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  budgetLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },
  budgetValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  budgetTrack: { height: 8, borderRadius: borderRadius.full, backgroundColor: colors.gray100, overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: borderRadius.full },
  segmentWrapper: { marginVertical: spacing.base },

  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.base },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },

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
