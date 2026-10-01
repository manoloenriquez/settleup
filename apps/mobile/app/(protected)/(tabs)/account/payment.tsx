import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { getPaymentProfile, removeQRImages, upsertPaymentProfile, uploadQRImage } from "@/services/payment-profiles";
import { staleQrPaths } from "@template/shared";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { Card, SectionHeader, ErrorBanner, useToast } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function PaymentSettingsScreen() {
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [gcashName, setGcashName] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashQrUrl, setGcashQrUrl] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankQrUrl, setBankQrUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showOnLinks, setShowOnLinks] = useState(false);
  const [fullNumbers, setFullNumbers] = useState(false);
  // QR images the saved profile points at, and ones uploaded since. Anything
  // the profile stops using is deleted so old codes don't stay public.
  const savedQrUrls = useRef<(string | null)[]>([]);
  const uploadedQrUrls = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      // Leaving without saving: drop uploads the profile never used.
      void removeQRImages(staleQrPaths(uploadedQrUrls.current, savedQrUrls.current, userId));
    };
  }, [userId]);

  useEffect(() => {
    async function load() {
      if (!userId) return;
      setLoading(true);
      setLoadError(null);
      const res = await getPaymentProfile(userId);
      if (res.error) {
        setLoadError(res.error);
      } else if (res.data) {
        setGcashName(res.data.gcash_name ?? "");
        setGcashNumber(res.data.gcash_number ?? "");
        setGcashQrUrl(res.data.gcash_qr_url ?? null);
        setBankName(res.data.bank_name ?? "");
        setBankAccount(res.data.bank_account_number ?? "");
        setBankAccountName(res.data.bank_account_name ?? "");
        setBankQrUrl(res.data.bank_qr_url ?? null);
        setNotes(res.data.notes ?? "");
        savedQrUrls.current = [res.data.gcash_qr_url ?? null, res.data.bank_qr_url ?? null];
        setShowOnLinks(res.data.show_on_shared_links);
        setFullNumbers(res.data.share_full_numbers);
      }
      setLoading(false);
    }
    void load();
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    const res = await upsertPaymentProfile(userId, {
      gcash_name: gcashName || null,
      gcash_number: gcashNumber || null,
      gcash_qr_url: gcashQrUrl,
      bank_name: bankName || null,
      bank_account_number: bankAccount || null,
      bank_account_name: bankAccountName || null,
      bank_qr_url: bankQrUrl,
      notes: notes || null,
      show_on_shared_links: showOnLinks,
      share_full_numbers: showOnLinks && fullNumbers,
    });
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    const kept = [gcashQrUrl, bankQrUrl];
    void removeQRImages(staleQrPaths([...savedQrUrls.current, ...uploadedQrUrls.current], kept, userId));
    savedQrUrls.current = kept;
    uploadedQrUrls.current = [];
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Payment details saved");
  }

  async function handleUploadQR(type: "gcash" | "bank") {
    const res = await uploadQRImage(userId, type);
    if (res.error && res.error !== "Cancelled") { toast.error(res.error); return; }
    if (res.data) {
      uploadedQrUrls.current.push(res.data);
      if (type === "gcash") setGcashQrUrl(res.data);
      else setBankQrUrl(res.data);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: "Payment Details", headerShown: true }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Payment Details", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
          {loadError && (
            <ErrorBanner
              message={`Couldn't load your payment settings: ${loadError}`}
              onDismiss={() => setLoadError(null)}
            />
          )}
          <SectionHeader title="GCash" />
          <Card>
            <View style={styles.fieldGroup}>
              <AppTextInput label="GCash Name" value={gcashName} onChangeText={setGcashName} placeholder="Full name on GCash" />
              <AppTextInput label="GCash Number" value={gcashNumber} onChangeText={setGcashNumber} placeholder="09XXXXXXXXX" keyboardType="phone-pad" />
              <TouchableOpacity accessibilityRole="button" style={styles.qrBtn} onPress={() => handleUploadQR("gcash")}>
                <Text style={styles.qrBtnText}>{gcashQrUrl ? "QR Uploaded \u2014 Tap to change" : "Upload GCash QR Code"}</Text>
              </TouchableOpacity>
            </View>
          </Card>

          <SectionHeader title="Bank" style={{ marginTop: spacing.base }} />
          <Card>
            <View style={styles.fieldGroup}>
              <AppTextInput label="Bank Name" value={bankName} onChangeText={setBankName} placeholder="e.g. BDO, BPI, UnionBank" />
              <AppTextInput label="Account Number" value={bankAccount} onChangeText={setBankAccount} placeholder="Account number" keyboardType="number-pad" />
              <AppTextInput label="Account Name" value={bankAccountName} onChangeText={setBankAccountName} placeholder="Full name on account" />
              <TouchableOpacity accessibilityRole="button" style={styles.qrBtn} onPress={() => handleUploadQR("bank")}>
                <Text style={styles.qrBtnText}>{bankQrUrl ? "QR Uploaded \u2014 Tap to change" : "Upload Bank QR Code"}</Text>
              </TouchableOpacity>
            </View>
          </Card>

          <SectionHeader title="Notes" style={{ marginTop: spacing.base }} />
          <Card>
            <AppTextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional payment notes…"
              multiline
              numberOfLines={3}
            />
          </Card>

          <SectionHeader title="Shared links" style={{ marginTop: spacing.base }} />
          <Card>
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Show on shared group links</Text>
                <Text style={styles.toggleBody}>
                  People who owe you money see these details on a group’s shared page, so they can pay
                  you without asking. Only shown while they owe you. You can hide them in any group.
                </Text>
              </View>
              <Switch
                value={showOnLinks}
                onValueChange={setShowOnLinks}
                trackColor={{ true: colors.primary }}
                accessibilityLabel="Show payment details on shared group links"
              />
            </View>
            {showOnLinks && (
              <View style={[styles.toggleRow, styles.toggleDivider]}>
                <View style={styles.toggleText}>
                  <Text style={styles.toggleTitle}>Show full account numbers</Text>
                  <Text style={styles.toggleBody}>
                    Off: only the last 4 digits show (your QR code, if uploaded, still lets people pay).
                    On: people can copy the full number.
                  </Text>
                </View>
                <Switch
                  value={fullNumbers}
                  onValueChange={setFullNumbers}
                  trackColor={{ true: colors.primary }}
                  accessibilityLabel="Show full account numbers on shared links"
                />
              </View>
            )}
          </Card>

          <AppButton
            title={saving ? "Saving\u2026" : "Save Payment Details"}
            onPress={handleSave}
            isLoading={saving}
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toggleDivider: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  toggleBody: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray500 },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing["2xl"] },
  fieldGroup: { gap: spacing.md },
  qrBtn: { backgroundColor: colors.gray100, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center" },
  qrBtnText: { fontSize: fontSize.sm, color: colors.gray600, fontWeight: fontWeight.medium },
});
