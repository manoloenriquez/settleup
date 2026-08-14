import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { getDashboardSummary } from "@/app/actions/dashboard";
import { getRecentActivity } from "@/app/actions/activity";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage(): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  const [result, activityResult] = await Promise.all([
    getDashboardSummary(),
    getRecentActivity(5),
  ]);
  const fetchedAt = Date.now();

  return (
    <DashboardClient
      profile={{ email: profile.email, full_name: profile.full_name }}
      initialSummary={result.data ? { data: result.data, updatedAt: fetchedAt } : undefined}
      initialActivity={activityResult.data ? { data: activityResult.data, updatedAt: fetchedAt } : undefined}
      initialError={result.error}
    />
  );
}
