import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Avatar, Badge } from "@/components/ui";
import { formatCents } from "@template/shared";
import type { MemberBalance } from "@template/shared";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

type MemberRowProps = {
  member: MemberBalance;
  webOrigin?: string;
  onUndoLastPayment?: (member: MemberBalance) => void;
};

export function MemberRow({ member, webOrigin, onUndoLastPayment }: MemberRowProps) {
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

  function handleLongPress() {
    const options: { text: string; onPress: () => void }[] = [];

    if (webOrigin && member.share_token) {
      const link = `${webOrigin}/p/${member.share_token}`;
      options.push({
        text: "Copy Share Link",
        onPress: async () => {
          await Clipboard.setStringAsync(link);
          Alert.alert("Copied", `Share link for ${member.display_name} copied`);
        },
      });

      const balanceText = isSettled
        ? "All settled up!"
        : isOwed
          ? `${member.display_name} is owed ${formatCents(net)}`
          : `${member.display_name} owes ${formatCents(Math.abs(net))}`;

      options.push({
        text: "Copy Balance Message",
        onPress: async () => {
          const msg = `${balanceText}\n\nView details: ${link}`;
          await Clipboard.setStringAsync(msg);
          Alert.alert("Copied", "Balance message copied");
        },
      });
    }

    if (options.length === 0 && !onUndoLastPayment) return;

    Alert.alert(member.display_name, undefined, [
      ...options.map((o) => ({ text: o.text, onPress: o.onPress })),
      ...(onUndoLastPayment
        ? [{
            text: "Undo last payment",
            style: "destructive" as const,
            onPress: () => onUndoLastPayment(member),
          }]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      <Avatar name={member.display_name} size={36} />
      <Text style={styles.name} numberOfLines={1}>{member.display_name}</Text>
      <Badge label={badgeLabel} variant={isSettled ? "neutral" : badgeVariant} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.base },
  name: { flex: 1, fontSize: fontSize.md, color: colors.gray900, fontWeight: fontWeight.medium },
});
