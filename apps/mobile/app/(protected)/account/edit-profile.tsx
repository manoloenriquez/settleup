import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { AppTextInput } from "@/components/ui/TextInput";
import { AppButton, useToast } from "@/components/ui";
import { colors, spacing } from "@/theme";

export default function EditProfileScreen() {
  const toast = useToast();
  const router = useRouter();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState("");

  // useProfile resolves async — seed the field once the profile loads so the
  // user's existing name appears instead of a blank box (which they could
  // otherwise overwrite by accident). Stable full_name won't fight typing.
  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile?.full_name]);

  async function handleSave() {
    const trimmed = fullName.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty.");
      return;
    }

    const result = await updateProfile.mutateAsync({ full_name: trimmed });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Profile updated");
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
