import React, { useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useGroupsWithStats, useArchivedGroups, useRestoreGroup } from "@/hooks/useGroups";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { AppButton, Badge, EmptyState, ErrorBanner, SkeletonCard, useToast } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { HeaderAddButton } from "@/components/HeaderAddButton";
import { largeTitleOptions } from "@/lib/navigation";
import { ROUTES } from "@/lib/routes";
import { presentChoices } from "@/hooks/useAddMenu";

export default function SharedScreen() {
  const { session } = useAuth();
  return session ? <GroupsScreen /> : <SharedGuestScreen />;
}

/** Guests see what sharing is and how to start, not an error. */
function SharedGuestScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ ...largeTitleOptions, title: "Shared" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.guest} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.guestIcon}>
          <Ionicons name="people" size={32} color={colors.primary} />
        </View>
        <Text style={styles.guestTitle} accessibilityRole="header">
          Share expenses with an account
        </Text>
        <Text style={styles.guestBody}>
          Create a free account to split trips, rent and dinners with friends. Talli keeps the
          balances, and people you add don’t need the app — they get a link showing what they owe
          and how to pay you.
        </Text>
        <View style={styles.guestPoints}>
          {[
            ["people-outline", "Groups and friends with shared balances"],
            ["link-outline", "A payment link with your GCash or bank details"],
            ["sync-outline", "Your expenses backed up and on every device"],
          ].map(([icon, text]) => (
            <View key={text} style={styles.guestPoint}>
              <Ionicons name={icon as React.ComponentProps<typeof Ionicons>["name"]} size={20} color={colors.primary} />
              <Text style={styles.guestPointText}>{text}</Text>
            </View>
          ))}
        </View>
        <AppButton title="Create Account" onPress={() => router.push(ROUTES.register)} />
        <AppButton title="Sign In" variant="secondary" onPress={() => router.push(ROUTES.login)} />
        <Text style={styles.guestNote}>
          Your personal expenses keep working without an account.
        </Text>
      </ScrollView>
    </>
  );
}

function GroupsScreen() {
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
          ...largeTitleOptions,
          title: "Shared",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.push(ROUTES.activity)}
              accessibilityRole="button"
              accessibilityLabel="Activity"
              hitSlop={12}
            >
              <Ionicons name="time-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <HeaderAddButton
              label="Create or join a group"
              onPress={() =>
                presentChoices("Shared expenses", [
                  { label: "Create Group", run: () => router.push(ROUTES.newGroup) },
                  { label: "Join with an Invite Code", run: () => router.push(ROUTES.joinGroup) },
                ])
              }
            />
          ),
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
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
            description="Create a group for a trip, a household or a night out, or join one with an invite code."
            actionLabel="Create Group"
            onAction={() => router.push(ROUTES.newGroup)}
          />
        ) : (
          <View style={styles.list}>
            {search.trim() !== "" && filteredGroups.length === 0 && (
              <Text
                style={{ color: colors.gray400, textAlign: "center", paddingVertical: spacing.lg }}
              >
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
                    <Text style={styles.cardName} numberOfLines={1}>
                      {group.name}
                    </Text>
                    <Text style={styles.cardMeta}>{group.member_count ?? 0} members</Text>
                  </View>
                  <View style={styles.cardRight}>
                    {(group.total_owed_cents ?? 0) > 0 ? (
                      <Text style={[styles.cardAmount, { color: colors.gray700 }]}>
                        {formatCents(group.total_owed_cents ?? 0)} open
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
            <TouchableOpacity
              onPress={() => setShowArchived((v) => !v)}
              style={styles.archivedToggle}
            >
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
                    <Text style={styles.archivedName} numberOfLines={1}>
                      {group.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRestore(group.id, group.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Restore ${group.name}`}
                      hitSlop={10}
                    >
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
  guest: { padding: spacing.xl, gap: spacing.base },
  guestIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  guestTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900 },
  guestBody: { fontSize: fontSize.md, lineHeight: 22, color: colors.gray600 },
  guestPoints: { gap: spacing.md, marginVertical: spacing.sm },
  guestPoint: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  guestPointText: { flex: 1, fontSize: fontSize.base, color: colors.gray800 },
  guestNote: { fontSize: fontSize.sm, color: colors.gray500, textAlign: "center" },
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
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
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

  archivedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  archivedToggleText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    fontWeight: fontWeight.medium,
  },
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
  archivedName: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.gray600 ?? colors.gray900,
    marginRight: spacing.sm,
  },
  restoreBtn: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
});
