import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { AppTextInput } from "@/components/ui/TextInput";
import { AppButton } from "@/components/ui";
import { colors, spacing } from "@/theme";

export default function EditProfileScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");

  async function handleSave() {
    const trimmed = fullName.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Name cannot be empty.");
      return;
    }

    const result = await updateProfile.mutateAsync({ full_name: trimmed });
    if (result.error) {
      Alert.alert("Error", result.error);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: "Edit Profile", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppTextInput
            label="Display Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            autoFocus
          />
          <AppButton
            title="Save"
            onPress={handleSave}
            isLoading={updateProfile.isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.md },
});
