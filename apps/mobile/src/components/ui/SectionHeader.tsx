import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

type SectionHeaderProps = {
  title: string;
  action?: React.ReactNode;
  style?: ViewStyle;
};

export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },
});
