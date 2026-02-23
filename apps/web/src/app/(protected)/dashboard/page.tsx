import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // cachedProfile() is already called in the layout — no extra DB round-trip.
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  const joinDate = new Date(profile.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back{profile.full_name ? `, ${profile.full_name}` : ""}!
        </h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s your account overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Profile card */}
        <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Profile
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900 break-all">
                {profile.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Display name</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">
                {profile.full_name ?? (
                  <span className="text-slate-400 font-normal italic">Not set</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Role</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    profile.role === "admin"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {profile.role}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Member since</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{joinDate}</dd>
            </div>
          </dl>
        </div>

        {/* Placeholder card — extend this with real stats */}
        <div className="col-span-1 rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm flex items-center justify-center">
          <p className="text-sm text-slate-400 text-center">
            Add your app stats here.
            <br />
            <span className="text-xs">e.g. usage, billing, activity</span>
          </p>
        </div>
      </div>
    </div>
  );
}
