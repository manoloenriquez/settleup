import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import { colors, fontSize, spacing, borderRadius } from "@/theme";

type ListItemProps = {
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  showChevron?: boolean;
};

export function ListItem({ left, title, subtitle, right, onPress, style, showChevron = false }: ListItemProps) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.row, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {left && <View style={styles.left}>{left}</View>}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right && <View style={styles.right}>{right}</View>}
      {showChevron && <Text style={styles.chevron}>›</Text>}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.base, backgroundColor: colors.surface },
  left: { marginRight: spacing.md },
  content: { flex: 1 },
  title: { fontSize: fontSize.md, color: colors.gray900, fontWeight: "500" },
  subtitle: { fontSize: fontSize.sm, color: colors.gray400, marginTop: 2 },
  right: { marginLeft: spacing.sm },
  chevron: { fontSize: 22, color: colors.gray300, marginLeft: 4 },
});
