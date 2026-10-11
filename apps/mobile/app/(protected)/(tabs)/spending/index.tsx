import { useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { formatAmount, groupPersonalExpensesByMonth, searchPersonalExpenses } from "@template/shared";
import { EmptyState, ErrorBanner } from "@/components/ui";
import { HeaderAddButton } from "@/components/HeaderAddButton";
import { ExpenseRow } from "@/components/personal/ExpenseRow";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAddMenu } from "@/hooks/useAddMenu";
import { largeTitleOptions } from "@/lib/navigation";
import { monthLabel } from "@/lib/dates";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function SpendingScreen() {
  const router = useRouter();
  const { expenses, status, error, reload } = usePersonalLedger();
  const { preferences } = usePreferences();
  const { openAddMenu, addExpense } = useAddMenu();
  const [query, setQuery] = useState("");

  const sections = useMemo(
    () =>
      groupPersonalExpensesByMonth(searchPersonalExpenses(expenses, query), preferences.defaultCurrency).map(
        (section) => ({ ...section, data: section.expenses }),
      ),
    [expenses, query, preferences.defaultCurrency],
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...largeTitleOptions,
          title: "Spending",
          headerRight: () => <HeaderAddButton onPress={openAddMenu} label="Add an expense" />,
          headerSearchBarOptions: {
            placeholder: "Search expenses",
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(""),
            hideWhenScrolling: true,
          },
        }}
      />
      <SectionList
        style={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        ListHeaderComponent={status === "error" && error ? <ErrorBanner message={error} onRetry={reload} /> : null}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader} accessibilityRole="header">
            <Text style={styles.sectionTitle}>{monthLabel(section.month)}</Text>
            <Text style={styles.sectionTotal}>
              {section.totals.map((total) => formatAmount(total.amountMinor, total.currency)).join(" · ")}
            </Text>
          </View>
        )}
        renderItem={({ item, index }) => (
          <View style={[styles.item, index > 0 && styles.divider]}>
            <ExpenseRow
              expense={item}
              onPress={() => router.push({ pathname: "/(protected)/expense/[id]", params: { id: item.id } })}
            />
          </View>
        )}
        ListEmptyComponent={
          status === "loading" ? null : query ? (
            <EmptyState icon="search-outline" title="No matches" description={`Nothing matches “${query}”.`} />
          ) : (
            <EmptyState
              icon="wallet-outline"
              title="No expenses yet"
              description="Everything you spend, in one list. Add one in a few seconds or scan a receipt."
              actionLabel="Add Expense"
              onAction={addExpense}
            />
          )
        }
        contentContainerStyle={styles.content}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing["3xl"] },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900 },
  sectionTotal: { fontSize: fontSize.sm, color: colors.gray500, fontVariant: ["tabular-nums"] },
  item: { backgroundColor: colors.surface, paddingHorizontal: spacing.base },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
