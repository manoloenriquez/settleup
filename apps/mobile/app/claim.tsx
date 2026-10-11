import { useLocalSearchParams } from "expo-router";
import { AcceptInvitation } from "@/components/AcceptInvitation";
export default function ClaimScreen(): React.ReactElement {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <AcceptInvitation kind="claim" token={typeof token === "string" ? token : ""} />;
}
