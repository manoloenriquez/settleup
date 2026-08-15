import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

// Thin RSC: only the profile for the greeting (already deduped with the
// layout's cachedProfile call — zero extra cost). All dashboard data renders
// from the persisted query cache and revalidates in the background.
export default async function DashboardPage(): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  return <DashboardClient profile={{ email: profile.email, full_name: profile.full_name }} />;
}
