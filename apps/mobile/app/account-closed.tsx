import { Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { AppButton } from "@/components/ui/Button";
export default function AccountClosedScreen(): React.ReactElement {
  const { signOut } = useAuth();
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Your app account is closed</Text>
      <Text>
        Your identity and payment details have been removed. Shared expense records remain with the
        groups. Logins in other applications are unaffected.
      </Text>
      <AppButton title="Sign out" onPress={signOut} />
    </View>
  );
}
