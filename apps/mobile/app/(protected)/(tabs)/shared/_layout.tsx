import { Stack } from "expo-router";
import { stackScreenOptions } from "@/lib/navigation";

export default function TabStackLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
