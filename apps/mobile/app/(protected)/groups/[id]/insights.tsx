import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getGroupInsights } from "@/services/insights";
import { useGroups } from "@/hooks/useGroups";
import { useInsightsAI } from "@/hooks/useInsightsAI";
import { AI_UNAVAILABLE_MESSAGE, useAiAvailability } from "@/hooks/useAiAvailability";
import { formatAmount, type CurrencyCode } from "@template/shared";
import { Card, ErrorBanner, SectionHeader, SkeletonCard, useToast } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function InsightsScreen() {
  const toast = useToast();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === groupId);

  const currency: CurrencyCode = group?.default_currency_code ?? "PHP";
  const formatCents = (minor: number): string => formatAmount(minor, currency);
  const { data: insights, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["insights", groupId, currency],
    queryFn: async () => {
      const res = await getGroupInsights(groupId, currency);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: !!groupId && !!group,
  });

  const { summary, isGenerating, generate } = useInsightsAI();
  const aiAvailability = useAiAvailability();

  function handleGenerateSummary() {
    if (aiAvailability.state === "unavailable") {
      toast.error(aiAvailability.reason ?? AI_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!insights || !group) return;
    void generate({
      groupName: group.name,
      insights: {
        total_expenses: insights.total_expenses,
        total_amount_cents: insights.total_amount_cents,
        average_expense_cents: insights.average_expense_cents,
        top_spender: null,
        most_common_item: insights.top_item ? { name: insights.top_item, count: 1 } : null,
        top_category: insights.top_category ?? null,
        categories: insights.categories.map((category) => ({
          id: null,
          name: category.name,
          slug: category.slug,
          icon: "circle-ellipsis",
          color: category.color,
          amount_cents: category.amount_cents,
          expense_count: category.expense_count,
        })),
        period: insights.period_days > 0 ? { first_expense: "", last_expense: "" } : null,
      },
      currency,
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: "Group Insights", headerShown: true }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />
        }
      >
        <SectionHeader title="Summary" />

        {isLoading ? (
          <View style={styles.cards}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : isError || !insights ? (
          isError ? (
            <ErrorBanner message="Couldn't load insights." onRetry={() => void refetch()} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No data yet. Add some expenses to see insights.</Text>
            </View>
          )
        ) : (
          <View style={styles.cards}>
            <Text style={styles.currencyNote}>
              Expenses in {currency}. Expenses in other currencies are not included here.
            </Text>
            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>TOTAL EXPENSES</Text>
              <Text style={styles.statValue}>{insights.total_expenses}</Text>
            </Card>

            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>TOTAL AMOUNT</Text>
              <Text style={styles.statValue}>{formatCents(insights.total_amount_cents)}</Text>
            </Card>

            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>AVERAGE EXPENSE</Text>
              <Text style={styles.statValue}>{formatCents(insights.average_expense_cents)}</Text>
            </Card>

            {insights.top_item && (
              <Card style={styles.statCard}>
                <Text style={styles.statLabel}>MOST COMMON ITEM</Text>
                <Text style={styles.statValue}>{insights.top_item}</Text>
              </Card>
            )}

            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>TRACKING PERIOD</Text>
              <Text style={styles.statValue}>{insights.period_days} days</Text>
            </Card>

            {insights.categories.length > 0 && (
              <Card>
                <Text style={styles.categoryTitle}>SPENDING BY CATEGORY</Text>
                {insights.categories.map((category) => {
                  const pct = insights.total_amount_cents > 0
                    ? Math.round((category.amount_cents / insights.total_amount_cents) * 100)
                    : 0;
                  return (
                    <View key={category.slug} style={styles.categoryRow}>
                      <View style={styles.categoryLabelRow}>
                        <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                        <Text style={styles.categoryName}>{category.name}</Text>
                      </View>
                      <Text style={styles.categoryAmount}>{formatCents(category.amount_cents)} · {pct}%</Text>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* AI Summary */}
            {summary ? (
              <Card>
                <View style={styles.aiBadgeRow}>
                  <View style={styles.aiBadge}>
                    <Text style={styles.aiBadgeText}>AI Summary</Text>
                  </View>
                </View>
                <Text style={styles.aiSummaryText}>{summary}</Text>
              </Card>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.generateBtn}
                onPress={handleGenerateSummary}
                activeOpacity={0.7}
                disabled={isGenerating}
              >
                <Text style={styles.generateBtnText}>
                  {isGenerating ? "Generating…" : "✨ Generate AI Summary"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  currencyNote: { fontSize: fontSize.sm, color: colors.gray500 },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing["2xl"] },
  cards: { padding: spacing.base, gap: spacing.sm },
  statCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },
  statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900 },
  categoryTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8, marginBottom: spacing.sm },
  categoryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  categoryLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  categoryName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray800 },
  categoryAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray900 },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.gray400, fontSize: fontSize.base, textAlign: "center" },
  aiBadgeRow: { marginBottom: spacing.sm },
  aiBadge: { alignSelf: "flex-start", backgroundColor: colors.primaryLight, borderRadius: 99, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  aiBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  aiSummaryText: { fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20 },
  generateBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: spacing.md,
    alignItems: "center",
  },
  generateBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
});
