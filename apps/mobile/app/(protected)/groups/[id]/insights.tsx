import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getGroupInsights } from "@/services/insights";
import { formatCents } from "@template/shared";
import { Card, SectionHeader, SkeletonCard } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function InsightsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();

  const { data: insights, isLoading } = useQuery({
    queryKey: ["insights", groupId],
    queryFn: () => getGroupInsights(groupId),
    enabled: !!groupId,
    select: (res) => res.data,
  });

  return (
    <>
      <Stack.Screen options={{ title: "Group Insights", headerShown: true }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.gray400, fontSize: fontSize.base, textAlign: "center" },
});
