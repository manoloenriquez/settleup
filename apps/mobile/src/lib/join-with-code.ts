import { Alert } from "react-native";
import type { InvitePreview } from "@template/shared";
import { PREVIEW_UNAVAILABLE, previewGroupInvite } from "@/services/collaboration";

export type JoinDecision =
  | { kind: "join" }
  | { kind: "open"; groupId: string; groupName: string }
  | { kind: "cancel" }
  | { kind: "error"; message: string };

/**
 * Before joining with a group code: if the group already lists someone with
 * your name who isn't on Talli, joining would add a second entry and leave the
 * expenses on the first. Say so and let the person choose.
 */
export async function decideJoin(code: string): Promise<JoinDecision> {
  const preview = await previewGroupInvite(code);
  if (preview.error === PREVIEW_UNAVAILABLE) return { kind: "join" };
  if (preview.error || !preview.data) {
    return { kind: "error", message: preview.error ?? "The invite couldn’t be checked. Try again." };
  }
  const p = preview.data;
  if (p.already_member && p.group_id) return { kind: "open", groupId: p.group_id, groupName: p.group_name };
  if (!p.name_taken) return { kind: "join" };
  return (await askAboutSameName(p)) ? { kind: "join" } : { kind: "cancel" };
}

function askAboutSameName(preview: InvitePreview): Promise<boolean> {
  const name = preview.your_name;
  return new Promise((resolve) => {
    Alert.alert(
      `There’s already a “${name}” in ${preview.group_name}`,
      `Someone added ${name} before you joined, and their expenses are under that entry. ` +
        `Ask the organizer to send you ${name}’s personal invite so they become yours. ` +
        `Joining with the code adds a second ${name}.`,
      [
        { text: "Don’t Join", style: "cancel", onPress: () => resolve(false) },
        { text: "Join as a New Member", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
