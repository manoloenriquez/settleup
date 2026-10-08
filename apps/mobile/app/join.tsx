import { useLocalSearchParams } from "expo-router";
import { AcceptInvitation } from "@/components/AcceptInvitation";
export default function JoinScreen(): React.ReactElement {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <AcceptInvitation kind="join" token={typeof code === "string" ? code : ""} />;
}
