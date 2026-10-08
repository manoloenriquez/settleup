import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { APP_NAME, summarizeMonth } from "@template/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AppButton, ErrorBanner } from "@/components/ui";
import { HeaderAddButton } from "@/components/HeaderAddButton";
import { ExpenseRow } from "@/components/personal/ExpenseRow";
import { MonthSummaryCard } from "@/components/personal/MonthSummaryCard";
import { SharedBalances } from "@/components/home/SharedBalances";
import { useAuth } from "@/context/AuthContext";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAddMenu } from "@/hooks/useAddMenu";
import { useStackedLayout } from "@/hooks/useStackedLayout";
import { SHARE_REASON, useAccountPrompt } from "@/hooks/useAccountPrompt";
import { largeTitleOptions } from "@/lib/navigation";
import { localTodayISO } from "@/lib/dates";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function HomeScreen() {
  const stacked = useStackedLayout();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { expenses, status, error, reload } = usePersonalLedger();
  const { preferences } = usePreferences();
  const { openAddMenu, addExpense, scanReceipt } = useAddMenu();
  const promptAccount = useAccountPrompt();
  const [refreshing, setRefreshing] = useState(false);
  const [hideInvite, setHideInvite] = useState(false);

  const month = localTodayISO().slice(0, 7);
  const summary = useMemo(
    () => summarizeMonth(expenses, month, preferences.defaultCurrency),
    [expenses, month, preferences.defaultCurrency],
  );
  const recent = expenses.slice(0, 5);

  async function refresh() {
    setRefreshing(true);
    reload();
    if (session) await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    setRefreshing(false);
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...largeTitleOptions,
          title: APP_NAME,
          headerRight: () => <HeaderAddButton onPress={openAddMenu} label="Add an expense" />,
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        {status === "error" && error && <ErrorBanner message={error} onRetry={reload} />}

        <MonthSummaryCard summary={summary} />

        <View style={[styles.actions, stacked && styles.stacked]}>
          <AppButton title="Add Expense" onPress={addExpense} style={styles.action} />
          <AppButton title="Scan Receipt" variant="secondary" onPress={scanReceipt} style={styles.action} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Recent expenses
          </Text>
          {expenses.length > 0 && (
            <TouchableOpacity onPress={() => router.push(ROUTES.spending)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.sectionLink}>See All</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.card}>
          {recent.length === 0 ? (
            <Text style={styles.empty}>
              {status === "loading"
                ? "Loading…"
                : "Your expenses appear here. Add one, scan a receipt, or describe it in a sentence."}
            </Text>
          ) : (
            recent.map((expense, index) => (
              <View key={expense.id} style={index > 0 ? styles.divider : undefined}>
                <ExpenseRow
                  expense={expense}
                  onPress={() => router.push({ pathname: "/(protected)/expense/[id]", params: { id: expense.id } })}
                />
              </View>
            ))
          )}
        </View>

        {session ? (
          <SharedBalances />
        ) : (
          !hideInvite && (
            <View style={styles.invite}>
              <View style={styles.inviteIcon}>
                <Ionicons name="people" size={22} color={colors.primary} />
              </View>
              <Text style={styles.inviteTitle}>Split costs with friends</Text>
              <Text style={styles.inviteBody}>
                Trips, rent or dinner: Talli works out who owes whom and sends everyone a link — they
                don’t need the app.
              </Text>
              <View style={styles.inviteActions}>
                <AppButton title="Create Account" onPress={() => router.push(ROUTES.register)} style={styles.action} />
                <AppButton title="Not Now" variant="ghost" onPress={() => setHideInvite(true)} style={styles.action} />
              </View>
              <TouchableOpacity onPress={() => promptAccount(SHARE_REASON)} accessibilityRole="button">
                <Text style={styles.inviteMore}>What does an account add?</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["3xl"], gap: spacing.base },
  actions: { flexDirection: "row", gap: spacing.sm },
  stacked: { flexDirection: "column" },
  action: { flex: 1, paddingHorizontal: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  sectionLink: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  empty: { paddingVertical: spacing.lg, fontSize: fontSize.base, lineHeight: 21, color: colors.gray500 },
  invite: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  inviteBody: { fontSize: fontSize.base, lineHeight: 21, color: colors.gray600 },
  inviteActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  inviteMore: { fontSize: fontSize.sm, color: colors.primary, textAlign: "center", paddingVertical: spacing.xs },
});
