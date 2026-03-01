import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { AppNav } from "@/components/layout/AppNav";


export default async function ProtectedLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav
        profile={{
          email: profile.email,
          role: profile.role,
          full_name: profile.full_name,
        }}
      />

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
