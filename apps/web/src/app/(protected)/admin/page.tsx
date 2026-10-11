import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/guards";
import { adminListWaitlist } from "@/app/actions/waitlist";
import { adminListProfiles } from "@/app/actions/profile";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { UsersTable } from "@/components/admin/UsersTable";
import { adminListProductEvents } from "@/app/actions/analytics";
import { ProductEventsTable } from "@/components/admin/ProductEventsTable";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage(): Promise<React.ReactElement> {
  // requireAdmin() redirects to /login or /dashboard if unauthorized.
  const { profile } = await requireAdmin();

  // Fetch both in parallel — neither depends on the other.
  const [waitlistResult, usersResult, eventsResult] = await Promise.all([
    adminListWaitlist(),
    adminListProfiles(),
    adminListProductEvents(100),
  ]);

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <span className="font-medium">{profile.email}</span>
        </p>
      </div>

      {/* Waitlist section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Waitlist</h2>
          {!waitlistResult.error && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {waitlistResult.data?.length ?? 0} entries
            </span>
          )}
        </div>

        {waitlistResult.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {waitlistResult.error}
          </div>
        ) : (
          <WaitlistTable entries={waitlistResult.data ?? []} />
        )}
      </section>

      {/* Users section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Users</h2>
          {!usersResult.error && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {usersResult.data?.length ?? 0} users
            </span>
          )}
        </div>

        {usersResult.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {usersResult.error}
          </div>
        ) : (
          <UsersTable users={usersResult.data ?? []} currentUserId={profile.id} />
        )}
      </section>

      {/* Product events section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Product events</h2>
          {!eventsResult.error && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              latest {eventsResult.data?.length ?? 0}
            </span>
          )}
        </div>
        {eventsResult.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {eventsResult.error}
          </div>
        ) : (
          <ProductEventsTable events={eventsResult.data ?? []} />
        )}
      </section>
    </div>
  );
}
