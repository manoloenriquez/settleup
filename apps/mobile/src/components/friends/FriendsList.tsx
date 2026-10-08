import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount } from "@template/shared";
import { Avatar, Card, EmptyState, ErrorBanner, SkeletonCard, useToast } from "@/components/ui";
import { RowMenuButton } from "@/components/RowMenuButton";
import { useAuth } from "@/context/AuthContext";
import { useFriends } from "@/hooks/useFriends";
import { useMembersWithBalances } from "@/hooks/useBalances";
import { removeFriend, type Friend } from "@/services/friends";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

function FriendRow({ friend, onRemove }: { friend: Friend; onRemove: () => void }) {
  const router = useRouter();
  const { session } = useAuth();
  const balancesQ = useMembersWithBalances(friend.direct_group_id, friend.default_currency_code);
  const mine = (balancesQ.data ?? []).find((m) => m.user_id === session?.user.id);
  const net = mine?.net_cents ?? 0;
  const amount = formatAmount(Math.abs(net), friend.default_currency_code);
  const line =
    balancesQ.isLoading
      ? "…"
      : net > 0
        ? `${friend.display_name} owes you ${amount}`
        : net < 0
          ? `You owe ${friend.display_name} ${amount}`
          : "Settled up";
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => router.push({ pathname: "/(protected)/groups/[id]", params: { id: friend.direct_group_id } })}
        accessibilityRole="button"
        accessibilityLabel={`${friend.display_name}. ${line}`}
        accessibilityHint="Opens your shared expenses"
      >
        <Avatar name={friend.display_name} size={40} />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>
            {friend.display_name}
          </Text>
          <Text style={[styles.balance, net > 0 ? styles.owed : net < 0 ? styles.owe : null]} numberOfLines={1}>
            {line}
          </Text>
        </View>
      </TouchableOpacity>
      <RowMenuButton
        title={friend.display_name}
        choices={[{ label: "Remove Friend", destructive: true, run: onRemove }]}
      />
    </View>
  );
}

/** One-to-one ledgers: each friend with what you owe each other. */
export function FriendsList() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const friendsQ = useFriends();
  const friends = friendsQ.data ?? [];

  function confirmRemove(friend: Friend) {
    Alert.alert(
      `Remove ${friend.display_name}?`,
      "Your shared expenses stay. They move to Groups, where you can still settle up.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const res = await removeFriend(friend.friend_user_id);
            if (res.error) return toast.error(res.error);
            void qc.invalidateQueries({ queryKey: ["friends"] });
            void qc.invalidateQueries({ queryKey: ["groups"] });
          },
        },
      ],
    );
  }

  if (friendsQ.isLoading) return <SkeletonCard />;
  if (friendsQ.isError) return <ErrorBanner message="Couldn't load your friends." onRetry={() => void friendsQ.refetch()} />;
  if (friends.length === 0) {
    return (
      <EmptyState
        icon="person-add-outline"
        title="Split one-on-one"
        description="Add a friend to keep a simple tab between the two of you — dinners, rides, rent. Send them a link; they join in a tap."
        actionLabel="Add a Friend"
        onAction={() => router.push("/(protected)/friends/add")}
      />
    );
  }
  return (
    <Card padding={0}>
      {friends.map((friend, index) => (
        <View key={friend.friend_user_id} style={index > 0 ? styles.divider : undefined}>
          <FriendRow friend={friend} onRemove={() => confirmRemove(friend)} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingRight: spacing.sm },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.base, minHeight: 64 },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  balance: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 2 },
  owed: { color: colors.success, fontWeight: fontWeight.semibold },
  owe: { color: colors.danger, fontWeight: fontWeight.semibold },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
