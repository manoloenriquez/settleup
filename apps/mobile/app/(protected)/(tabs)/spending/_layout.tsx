import { Stack } from "expo-router";
import { useStackScreenOptions } from "@/lib/navigation";

// Budget screens opened from Home land on top of the Spending list, so Back
// always has somewhere to go.
export const unstable_settings = { anchor: "index" };

export default function TabStackLayout() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}
