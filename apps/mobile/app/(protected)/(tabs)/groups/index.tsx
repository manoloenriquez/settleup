import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useGroupsWithStats } from "@/hooks/useGroups";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { Badge, EmptyState, SkeletonCard } from "@/components/ui";

export default function GroupsScreen() {
  const router = useRouter();
  const { data: groups, isLoading, isFetching, refetch } = useGroupsWithStats();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Groups",
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(protected)/groups/new")}
              style={styles.headerBtn}
            >
              <Text style={styles.headerBtnText}>+ New</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <View style={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (groups ?? []).length === 0 ? (
          <EmptyState
            icon="👥"
            title="No groups yet"
            description="Create a group to start tracking shared expenses"
            actionLabel="Create Group"
            onAction={() => router.push("/(protected)/groups/new")}
          />
        ) : (
          <View style={styles.list}>
            {(groups ?? []).map((group) => (
              <TouchableOpacity
                key={group.id}
                style={styles.card}
                onPress={() => router.push(`/(protected)/groups/${group.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardEmoji}>
                    <Text style={styles.emojiText}>👥</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName} numberOfLines={1}>{group.name}</Text>
                    <Text style={styles.cardMeta}>{group.member_count ?? 0} members</Text>
                  </View>
                  <View style={styles.cardRight}>
                    {(group.total_owed_cents ?? 0) > 0 ? (
                      <Text style={[styles.cardAmount, { color: colors.danger }]}>
                        {formatCents(group.total_owed_cents ?? 0)}
                      </Text>
                    ) : (
                      <Badge label="Settled" variant="success" />
                    )}
                    {(group.pending_count ?? 0) > 0 && (
                      <Badge label={`${group.pending_count}`} variant="warning" />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },
  list: { gap: spacing.sm },

  headerBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  headerBtnText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  cardMeta: { fontSize: fontSize.sm, color: colors.gray400, marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: spacing.xs },
  cardAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
});
