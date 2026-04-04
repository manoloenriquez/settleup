import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import type { SmartSplitResult } from "@template/shared/types";
import { formatCents } from "@template/shared";
import { AppButton } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type SmartSplitSheetProps = {
  itemName: string;
  amountCents: number;
  memberNames: string[];
  isLoading: boolean;
  result: SmartSplitResult | null;
  onSuggest: (context: string) => void;
  onApply: (result: SmartSplitResult) => void;
  onClose: () => void;
};

export function SmartSplitSheet({
  itemName,
  amountCents,
  memberNames,
  isLoading,
  result,
  onSuggest,
  onApply,
  onClose,
}: SmartSplitSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const [context, setContext] = useState("");

  const snapPoints = ["50%", "70%"];

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
    onClose();
  }, [onClose]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onClose={onClose}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Smart Split</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Splitting "{itemName}" ({formatCents(amountCents)}) among {memberNames.length} members
        </Text>

        <Text style={styles.label}>Context (optional)</Text>
        <TextInput
          style={styles.contextInput}
          value={context}
          onChangeText={setContext}
          placeholder='e.g. "Manolo had 2 drinks, others had 1"'
          placeholderTextColor={colors.gray400}
          multiline
          numberOfLines={3}
        />

        <AppButton
          title={isLoading ? "Thinking…" : "Suggest Split"}
          onPress={() => onSuggest(context)}
          isLoading={isLoading}
          disabled={isLoading}
        />

        {result && (
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>SUGGESTED SPLIT</Text>
            {result.explanation && (
              <Text style={styles.explanation}>{result.explanation}</Text>
            )}
            <View style={styles.suggestions}>
              {result.suggestions.map((s, i) => (
                <View key={i} style={styles.suggestionRow}>
                  <Text style={styles.memberName}>{s.member_name}</Text>
                  {s.reason && <Text style={styles.reason}>{s.reason}</Text>}
                  <Text style={styles.shareAmount}>{formatCents(s.share_cents)}</Text>
                </View>
              ))}
            </View>
            <AppButton title="Apply This Split" onPress={() => onApply(result)} />
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { backgroundColor: colors.border },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  closeBtn: { fontSize: fontSize.md, color: colors.gray500, padding: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: colors.gray600 },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  contextInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.gray900,
    minHeight: 72,
    textAlignVertical: "top",
  },
  resultSection: { gap: spacing.sm, marginTop: spacing.xs },
  resultLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },
  explanation: { fontSize: fontSize.sm, color: colors.gray600, fontStyle: "italic" },
  suggestions: { gap: spacing.xs },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  memberName: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray900 },
  reason: { flex: 1, fontSize: fontSize.xs, color: colors.gray500 },
  shareAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
});
