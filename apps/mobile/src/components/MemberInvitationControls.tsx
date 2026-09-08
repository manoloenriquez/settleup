import { useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { AppButton } from "@/components/ui/Button";

export function MemberInvitationControls({ memberId }: { memberId: string }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(revoke: boolean): Promise<void> {
    setBusy(true);
    try {
      const origin = process.env.EXPO_PUBLIC_WEB_URL;
      if (!revoke && !origin) {
        setMessage("Sharing is unavailable until the app's web address is configured.");
        return;
      }
      if (revoke) {
        const { error } = await supabase
          .schema("settleup")
          .rpc("revoke_member_claim_invitation", { p_member_id: memberId });
        setMessage(error ? error.message : "Invitation revoked.");
      } else {
        const { data, error } = await supabase
          .schema("settleup")
          .rpc("create_member_claim_invitation", { p_member_id: memberId });
        const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(data);
        if (error || !parsed.success) {
          setMessage(error?.message ?? "Could not create invitation.");
          return;
        }
        await Clipboard.setStringAsync(
          `${origin?.replace(/\/$/, "")}/claim?token=${parsed.data.token}`,
        );
        setMessage(
          "Personal invitation copied. Send only to this person. Expires in 7 days; replaces older invitations.",
        );
      }
    } catch {
      setMessage("Could not update the invitation. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <AppButton
        title="Copy personal invitation"
        variant="secondary"
        isLoading={busy}
        onPress={() => change(false)}
      />
      <AppButton
        title="Revoke invitation"
        variant="secondary"
        disabled={busy}
        onPress={() => change(true)}
      />
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
    </View>
  );
}
