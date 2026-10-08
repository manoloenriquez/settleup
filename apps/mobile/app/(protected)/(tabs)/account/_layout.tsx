import { Stack } from "expo-router";
import { useStackScreenOptions } from "@/lib/navigation";

export default function TabStackLayout() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}
