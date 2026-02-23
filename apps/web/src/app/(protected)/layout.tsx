import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_NAME, ROUTES } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { signOut } from "@/app/actions/auth";


export default async function ProtectedLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Brand */}
          <Link
            href={ROUTES.DASHBOARD}
            className="text-lg font-bold text-slate-900 hover:text-indigo-600 transition-colors"
          >
            {APP_NAME}
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.DASHBOARD}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Dashboard
            </Link>

            <Link
              href={ROUTES.GROUPS}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Groups
            </Link>

            {/* Admin link — visible to admins only */}
            {profile.role === "admin" && (
              <Link
                href={ROUTES.ADMIN}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                Admin
              </Link>
            )}

            {/* User badge */}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-6">
              <span className="hidden sm:block text-sm text-slate-500 max-w-[180px] truncate">
                {profile.email}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  profile.role === "admin"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {profile.role}
              </span>
            </div>

            {/* Sign out — form action directly to Server Action */}
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
