import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type ReceiptScannerProps = {
  imageUri: string | null;
  isScanning: boolean;
  error: string | null;
  onCamera: () => void;
  onGallery: () => void;
  onClear: () => void;
};

export function ReceiptScanner({ imageUri, isScanning, error, onCamera, onGallery, onClear }: ReceiptScannerProps) {
  if (isScanning) {
    return (
      <View style={styles.scanning}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.scanningText}>Scanning receipt…</Text>
      </View>
    );
  }

  if (imageUri) {
    return (
      <View style={styles.preview}>
        <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.clearBtn} onPress={onClear} activeOpacity={0.7}>
          <Text style={styles.clearBtnText}>Use Different Image</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Scan a receipt to automatically extract expense details</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onCamera} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={32} color={colors.gray500} />
          <Text style={styles.actionLabel}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onGallery} activeOpacity={0.7}>
          <Ionicons name="images-outline" size={32} color={colors.gray500} />
          <Text style={styles.actionLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignItems: "center", paddingVertical: spacing.xl },
  hint: { fontSize: fontSize.sm, color: colors.gray500, textAlign: "center", paddingHorizontal: spacing.lg },
  errorBox: { backgroundColor: colors.dangerLight, borderRadius: borderRadius.md, padding: spacing.md, width: "100%" },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.md },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  actionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  scanning: { alignItems: "center", gap: spacing.md, paddingVertical: spacing["2xl"] },
  scanningText: { fontSize: fontSize.sm, color: colors.gray500 },
  preview: { gap: spacing.md },
  previewImage: { width: "100%", height: 200, borderRadius: borderRadius.md, backgroundColor: colors.gray100 },
  clearBtn: { alignSelf: "center", paddingVertical: spacing.sm },
  clearBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
});
