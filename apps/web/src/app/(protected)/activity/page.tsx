import type { Metadata } from "next";
import { ActivityClient } from "@/components/dashboard/ActivityClient";

export const metadata: Metadata = { title: "Activity" };

// Thin RSC: the feed renders from the persisted query cache instantly and
// revalidates in the background.
export default function ActivityPage(): React.ReactElement {
  return <ActivityClient />;
}
