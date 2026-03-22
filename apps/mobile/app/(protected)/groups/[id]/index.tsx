import { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMembersWithBalances } from "@/hooks/useBalances";
import { useExpenses, useDeleteExpense } from "@/hooks/useExpenses";
import { useGroupActivity } from "@/hooks/useActivity";
import { DebtSummary } from "@/components/groups/DebtSummary";
import { MemberRow } from "@/components/groups/MemberRow";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { ActivityTimeline } from "@/components/groups/ActivityTimeline";
import { SegmentedControl, Card } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import type { SimplifiedDebt } from "@template/shared";

type Tab = "balances" | "expenses" | "activity";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("balances");

  const balancesQ = useMembersWithBalances(id);
  const expensesQ = useExpenses(id);
  const activityQ = useGroupActivity(id);
  const deleteExpense = useDeleteExpense(id);

  const isLoading = balancesQ.isLoading || expensesQ.isLoading;
  const isRefreshing = balancesQ.isFetching || expensesQ.isFetching || activityQ.isFetching;

  function handleRefresh() {
    void balancesQ.refetch();
    void expensesQ.refetch();
    void activityQ.refetch();
  }

  function handleSettle(debt: SimplifiedDebt) {
    router.push({
      pathname: `/(protected)/groups/${id}/settle-up`,
      params: { fromId: debt.from_member_id, toId: debt.to_member_id, amount: String(debt.amount_cents) },
    });
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
          title: "Group",
          headerRight: () => (
            <View style={styles.headerBtns}>
              <TouchableOpacity onPress={() => router.push(`/(protected)/groups/${id}/settings`)} hitSlop={8}>
                <Text style={styles.headerIcon}>⚙️</Text>
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
          {/* Debt Summary */}
          <Text style={styles.sectionTitle}>WHO OWES WHO</Text>
          <DebtSummary members={balancesQ.data ?? []} onSettle={handleSettle} />

          {/* Segmented Tabs */}
          <View style={styles.segmentWrapper}>
            <SegmentedControl segments={segments} value={tab} onChange={setTab} />
          </View>

          {/* Tab Content */}
          {tab === "balances" && (
            <Card padding={0}>
              {(balancesQ.data ?? []).map((m, i) => (
                <View key={m.member_id}>
                  <MemberRow member={m} />
                  {i < (balancesQ.data ?? []).length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </Card>
          )}

          {tab === "expenses" && (
            <ExpenseList
              expenses={expensesQ.data ?? []}
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
        <Text style={styles.fabText}>+ Add Expense</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: 100 },

  headerBtns: { flexDirection: "row", gap: spacing.md },
  headerIcon: { fontSize: 20 },

  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8, marginBottom: spacing.sm },

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
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: colors.white, fontWeight: fontWeight.bold, fontSize: fontSize.md },
});
