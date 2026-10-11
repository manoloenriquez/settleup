import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CURRENCY_CODES, currencyName, currencySymbol, type CurrencyCode } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Props = {
  visible: boolean;
  selected: CurrencyCode;
  /** Shown first, e.g. the default currency and recently used ones. */
  suggested?: CurrencyCode[];
  onSelect: (currency: CurrencyCode) => void;
  onClose: () => void;
};

/** Searchable currency list in a native page sheet (swipe down to close). */
export function CurrencyPicker({ visible, selected, suggested = [], onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordered = [...new Set<CurrencyCode>([...suggested, ...CURRENCY_CODES])];
    if (!q) return ordered;
    return ordered.filter(
      (code) => code.toLowerCase().includes(q) || currencyName(code).toLowerCase().includes(q),
    );
  }, [query, suggested]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => setQuery("")}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Currency
          </Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.gray400} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search currencies"
            placeholderTextColor={colors.gray400}
            style={styles.searchInput}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search currencies"
          />
        </View>
        <FlatList
          data={items}
          keyExtractor={(code) => code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item === selected;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${currencyName(item)}, ${item}`}
              >
                <Text style={styles.symbol}>{currencySymbol(item)}</Text>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{currencyName(item)}</Text>
                  <Text style={styles.code}>{item}</Text>
                </View>
                {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>No currency matches “{query}”.</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  done: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: colors.gray900, paddingVertical: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  symbol: { width: 40, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray700, textAlign: "center" },
  rowText: { flex: 1 },
  name: { fontSize: fontSize.base, color: colors.gray900 },
  code: { fontSize: fontSize.sm, color: colors.gray500 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
  empty: { padding: spacing.xl, textAlign: "center", color: colors.gray500 },
});
