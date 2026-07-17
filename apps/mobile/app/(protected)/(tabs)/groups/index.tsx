import React, { useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useGroupsWithStats, useArchivedGroups, useRestoreGroup } from "@/hooks/useGroups";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { Badge, EmptyState, ErrorBanner, SkeletonCard, useToast } from "@/components/ui";

export default function GroupsScreen() {
  const toast = useToast();
  const router = useRouter();
  const { data: groups, isLoading, isFetching, isError, refetch } = useGroupsWithStats();
  const { data: archivedGroups } = useArchivedGroups();
  const restoreGroup = useRestoreGroup();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups ?? [];
    return (groups ?? []).filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  function handleRestore(groupId: string, name: string) {
    Alert.alert("Restore Group?", `Restore "${name}" to your active groups?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          const r = await restoreGroup.mutateAsync(groupId);
          if (r.error) toast.error(r.error);
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Groups",
          headerShown: true,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={() => router.push("/(protected)/join")}
                style={styles.headerBtn}
              >
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={styles.headerBtnText}>Join</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/(protected)/groups/new")}
                style={styles.headerBtn}
              >
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={styles.headerBtnText}>New</Text>
              </TouchableOpacity>
            </View>
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
        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search groups…"
          placeholderTextColor={colors.gray400}
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />

        {/* A failed refresh with cached data still renders the (stale) list;
            only surface the error when there is nothing to show instead of a
            silent empty state. */}
        {isError && (groups ?? []).length > 0 && (
          <Text style={styles.staleHint}>Couldn&apos;t refresh — showing saved data</Text>
        )}
        {isLoading ? (
          <View style={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : isError && (groups ?? []).length === 0 ? (
          <ErrorBanner message="Couldn't load your groups." onRetry={() => void refetch()} />
        ) : (groups ?? []).length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No groups yet"
            description="Create a group to start tracking shared expenses"
            actionLabel="Create Group"
            onAction={() => router.push("/(protected)/groups/new")}
          />
        ) : (
          <View style={styles.list}>
            {search.trim() !== "" && filteredGroups.length === 0 && (
              <Text style={{ color: colors.gray400, textAlign: "center", paddingVertical: spacing.lg }}>
                No groups match &quot;{search}&quot;
              </Text>
            )}
            {filteredGroups.map((group) => (
              <TouchableOpacity
                key={group.id}
                style={styles.card}
                onPress={() => router.push(`/(protected)/groups/${group.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIconWrap}>
                    <Ionicons name="people" size={20} color={colors.primary} />
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
                    <Ionicons name="chevron-forward" size={14} color={colors.gray300} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* Archived groups */}
        {(archivedGroups ?? []).length > 0 && (
          <View style={{ marginTop: spacing.xl }}>
            <TouchableOpacity onPress={() => setShowArchived((v) => !v)} style={styles.archivedToggle}>
              <Ionicons
                name={showArchived ? "chevron-down" : "chevron-forward"}
                size={14}
                color={colors.gray400}
              />
              <Text style={styles.archivedToggleText}>
                {archivedGroups?.length} archived group{archivedGroups?.length !== 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
            {showArchived && (
              <View style={[styles.list, { marginTop: spacing.sm }]}>
                {(archivedGroups ?? []).map((group) => (
                  <View key={group.id} style={styles.archivedCard}>
                    <Text style={styles.archivedName} numberOfLines={1}>{group.name}</Text>
                    <TouchableOpacity onPress={() => handleRestore(group.id, group.name)}>
                      <Text style={styles.restoreBtn}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
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
  staleHint: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.gray900,
    marginBottom: spacing.sm,
  },

  headerButtons: { flexDirection: "row", gap: spacing.base, alignItems: "center" },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  headerBtnText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  cardMeta: { fontSize: fontSize.sm, color: colors.gray400, marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: spacing.xs },
  cardAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },

  archivedToggle: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  archivedToggleText: { fontSize: fontSize.sm, color: colors.gray400, fontWeight: fontWeight.medium },
  archivedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.6,
  },
  archivedName: { flex: 1, fontSize: fontSize.md, color: colors.gray600 ?? colors.gray900, marginRight: spacing.sm },
  restoreBtn: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
});
