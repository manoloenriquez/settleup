import { StyleSheet, Text, View } from "react-native";
import { Avatar, Badge } from "@/components/ui";
import { formatCents } from "@template/shared";
import type { MemberBalance } from "@template/shared";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

type MemberRowProps = {
  member: MemberBalance;
};

export function MemberRow({ member }: MemberRowProps) {
  const net = member.net_cents;
  const isSettled = Math.abs(net) < 1;
  const isOwed = net > 0;

  let badgeVariant: "success" | "danger" | "neutral" = "neutral";
  let badgeLabel = "Settled";
  if (!isSettled) {
    if (isOwed) {
      badgeVariant = "success";
      badgeLabel = `+${formatCents(net)}`;
    } else {
      badgeVariant = "danger";
      badgeLabel = `-${formatCents(Math.abs(net))}`;
    }
  }

  return (
    <View style={styles.row}>
      <Avatar name={member.display_name} size={36} />
      <Text style={styles.name} numberOfLines={1}>{member.display_name}</Text>
      <Badge label={badgeLabel} variant={isSettled ? "neutral" : badgeVariant} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.base },
  name: { flex: 1, fontSize: fontSize.md, color: colors.gray900, fontWeight: fontWeight.medium },
});
