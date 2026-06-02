import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getGroupInsights } from "@/services/insights";
import { useGroups } from "@/hooks/useGroups";
import { useInsightsAI } from "@/hooks/useInsightsAI";
import { formatCents } from "@template/shared";
import { Card, SectionHeader, SkeletonCard } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function InsightsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === groupId);

  const { data: insights, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["insights", groupId],
    queryFn: () => getGroupInsights(groupId),
    enabled: !!groupId,
    select: (res) => res.data,
  });

  const { summary, isGenerating, generate } = useInsightsAI();

  function handleGenerateSummary() {
    if (!insights || !group) return;
    void generate({
      groupId,
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
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: "Group Insights", headerShown: true }} />
      <ScrollView
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
        ) : !insights ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No data yet. Add some expenses to see insights.</Text>
          </View>
        ) : (
          <View style={styles.cards}>
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
