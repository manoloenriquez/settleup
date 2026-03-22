import { useState, useEffect } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { getPaymentProfile, upsertPaymentProfile, uploadQRImage } from "@/services/payment-profiles";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { Card, SectionHeader } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function PaymentSettingsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [gcashName, setGcashName] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashQrUrl, setGcashQrUrl] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankQrUrl, setBankQrUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      if (!userId) return;
      setLoading(true);
      const res = await getPaymentProfile(userId);
      if (res.data) {
        setGcashName(res.data.gcash_name ?? "");
        setGcashNumber(res.data.gcash_number ?? "");
        setGcashQrUrl(res.data.gcash_qr_url ?? null);
        setBankName(res.data.bank_name ?? "");
        setBankAccount(res.data.bank_account_number ?? "");
        setBankAccountName(res.data.bank_account_name ?? "");
        setBankQrUrl(res.data.bank_qr_url ?? null);
        setNotes(res.data.notes ?? "");
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
    });
    setSaving(false);
    if (res.error) { Alert.alert("Error", res.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Payment settings updated.");
  }

  async function handleUploadQR(type: "gcash" | "bank") {
    const res = await uploadQRImage(userId, type);
    if (res.error && res.error !== "Cancelled") { Alert.alert("Error", res.error); return; }
    if (res.data) {
      if (type === "gcash") setGcashQrUrl(res.data);
      else setBankQrUrl(res.data);
    }
  }

  if (loading) return null;

  return (
    <>
      <Stack.Screen options={{ title: "Payment Settings", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <SectionHeader title="GCash" />
          <Card>
            <View style={styles.fieldGroup}>
              <AppTextInput label="GCash Name" value={gcashName} onChangeText={setGcashName} placeholder="Full name on GCash" />
              <AppTextInput label="GCash Number" value={gcashNumber} onChangeText={setGcashNumber} placeholder="09XXXXXXXXX" keyboardType="phone-pad" />
              <TouchableOpacity style={styles.qrBtn} onPress={() => handleUploadQR("gcash")}>
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
              <TouchableOpacity style={styles.qrBtn} onPress={() => handleUploadQR("bank")}>
                <Text style={styles.qrBtnText}>{bankQrUrl ? "QR Uploaded \u2014 Tap to change" : "Upload Bank QR Code"}</Text>
              </TouchableOpacity>
            </View>
          </Card>

          <SectionHeader title="Notes" style={{ marginTop: spacing.base }} />
          <Card>
            <AppTextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional payment notes\u2026"
              multiline
              numberOfLines={3}
            />
          </Card>

          <AppButton
            title={saving ? "Saving\u2026" : "Save Payment Settings"}
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
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing["2xl"] },
  fieldGroup: { gap: spacing.md },
  qrBtn: { backgroundColor: colors.gray100, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center" },
  qrBtnText: { fontSize: fontSize.sm, color: colors.gray600, fontWeight: fontWeight.medium },
});
