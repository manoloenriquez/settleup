import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { createMobileClient } from "@template/supabase";
import { formatCents } from "@template/shared";
import type { GroupMember } from "@template/supabase";

type MemberWithBalance = GroupMember & { owed_cents: number; is_paid: boolean };

export default function GroupDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const supabase = createMobileClient();

  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<MemberWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const db = supabase.schema("settleup");
    const [groupRes, membersRes, sharesRes, paymentsRes] = await Promise.all([
      db.from("groups").select("name").eq("id", id).single(),
      db.from("group_members").select("*").eq("group_id", id).order("created_at"),
      db.from("expense_participants").select("member_id, share_cents"),
      db.from("payments").select("member_id, amount_cents"),
    ]);

    if (groupRes.error) Alert.alert("Error", groupRes.error.message);
    else setGroupName(groupRes.data?.name ?? "");

    if (membersRes.error) {
      Alert.alert("Error", membersRes.error.message);
      setLoading(false);
      return;
    }

    const memberList = membersRes.data ?? [];
    const memberIds = new Set(memberList.map((m) => m.id));

    const sharesMap = new Map<string, number>();
    for (const row of sharesRes.data ?? []) {
      if (memberIds.has(row.member_id)) {
        sharesMap.set(row.member_id, (sharesMap.get(row.member_id) ?? 0) + row.share_cents);
      }
    }
    const paidMap = new Map<string, number>();
    for (const row of paymentsRes.data ?? []) {
      if (memberIds.has(row.member_id)) {
        paidMap.set(row.member_id, (paidMap.get(row.member_id) ?? 0) + row.amount_cents);
      }
    }

    const withBalances: MemberWithBalance[] = memberList.map((m) => {
      const owed = Math.max(0, (sharesMap.get(m.id) ?? 0) - (paidMap.get(m.id) ?? 0));
      return { ...m, owed_cents: owed, is_paid: owed === 0 };
    });

    setMembers(withBalances);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <>
      <Stack.Screen options={{ title: groupName || "Group" }} />
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.btn, styles.primary]}
          onPress={() => router.push(`/groups/${id}/add-expense`)}
        >
          <Text style={styles.primaryText}>+ Add Expense</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.sectionTitle}>Members & Balances</Text>}
            renderItem={({ item }) => (
              <View style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{item.display_name}</Text>
                  <Text
                    style={[
                      styles.memberAmount,
                      item.is_paid ? styles.paid : styles.owed,
                    ]}
                  >
                    {item.is_paid ? "Paid ✓" : formatCents(item.owed_cents)}
                  </Text>
                </View>
                <View style={[styles.badge, item.is_paid ? styles.badgePaid : styles.badgeOwed]}>
                  <Text
                    style={[
                      styles.badgeText,
                      item.is_paid ? styles.badgePaidText : styles.badgeOwedText,
                    ]}
                  >
                    {item.is_paid ? "Paid" : "Pending"}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  list: { gap: 10, paddingBottom: 32 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#9ca3af",
    marginBottom: 8,
  },
  memberCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  memberAmount: { fontSize: 13, fontWeight: "500" },
  paid: { color: "#16a34a" },
  owed: { color: "#ef4444" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  badgePaid: { backgroundColor: "#dcfce7" },
  badgeOwed: { backgroundColor: "#fef3c7" },
  badgeText: { fontSize: 11, fontWeight: "600" },
  badgePaidText: { color: "#15803d" },
  badgeOwedText: { color: "#92400e" },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  primary: { backgroundColor: "#6366f1" },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
