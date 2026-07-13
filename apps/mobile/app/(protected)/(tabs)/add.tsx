import { View } from "react-native";

/**
 * Stub screen backing the center "+" tab. Never shown — the tab's
 * `tabPress` listener in the layout intercepts the press and routes to
 * the right add-expense destination instead.
 */
export default function AddStubScreen() {
  return <View />;
}
