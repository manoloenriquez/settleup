import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, useToast } from "@/components/ui";
import { useResolvePendingPayment } from "@/hooks/usePayments";
import type { PendingPayment } from "@/services/payments";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type MemberInfo = {
  id: string;
  display_name: string;
  user_id: string | null;
  role: string;
};

type Props = {
  groupId: string;
  pending: PendingPayment[];
  members: MemberInfo[];
  currentUserId: string | undefined;
};

export function PendingPaymentsCard({ groupId, pending, members, currentUserId }: Props): React.ReactElement | null {
  const toast = useToast();
  const resolve = useResolvePendingPayment(groupId);

  if (pending.length === 0) return null;

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const myMember = members.find((m) => m.user_id === currentUserId);
  const isAdminOrOwner = myMember?.role === "admin" || myMember?.role === "owner";

  function canResolve(payment: PendingPayment): boolean {
    const toMember = memberMap.get(payment.to_member_id);
    return isAdminOrOwner || (toMember?.user_id != null && toMember.user_id === currentUserId);
  }

  function handleResolve(payment: PendingPayment, action: "confirm" | "reject") {
    resolve.mutate(
      { paymentId: payment.id, action },
      {
        onSuccess: (res) => {
          if (res.error) {
            toast.error(res.error);
            return;
          }
          toast.success(action === "confirm" ? "Payment confirmed" : "Payment rejected");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update payment"),
      },
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={16} color={colors.warningDark} />
        <Text style={styles.title}>
          Pending payment{pending.length !== 1 ? "s" : ""} ({pending.length})
        </Text>
      </View>
      {pending.map((payment) => {
        const from = memberMap.get(payment.from_member_id);
        const to = memberMap.get(payment.to_member_id);
        const resolvable = canResolve(payment);
        return (
          <View key={payment.id} style={styles.row}>
            <Avatar name={from?.display_name ?? "?"} size={32} />
            <View style={styles.rowBody}>
              <Text style={styles.rowText}>
                <Text style={styles.bold}>{from?.display_name ?? "Unknown"}</Text> says they paid{" "}
                <Text style={styles.bold}>{to?.display_name ?? "Unknown"}</Text>{" "}
                <Text style={styles.amount}>{formatCents(payment.amount_cents)}</Text>
              </Text>
              {payment.note ? (
                <Text style={styles.note} numberOfLines={1}>
                  “{payment.note}”
                </Text>
              ) : null}
              {resolvable ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={() => handleResolve(payment, "confirm")}
                    disabled={resolve.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm payment from ${from?.display_name ?? "member"}`}
                  >
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                    <Text style={styles.confirmText}>Confirm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleResolve(payment, "reject")}
                    disabled={resolve.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Reject payment from ${from?.display_name ?? "member"}`}
                  >
                    <Ionicons name="close" size={14} color={colors.gray600} />
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.waiting}>Waiting for {to?.display_name ?? "recipient"}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.base,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.warningDark },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  rowBody: { flex: 1, gap: spacing.xs },
  rowText: { fontSize: fontSize.base, color: colors.gray700 },
  bold: { fontWeight: fontWeight.semibold },
  amount: { fontWeight: fontWeight.bold, color: colors.gray900 },
  note: { fontSize: fontSize.sm, color: colors.gray500 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  confirmText: { color: colors.white, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  rejectText: { color: colors.gray600, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  waiting: { fontSize: fontSize.sm, color: colors.gray400 },
});
