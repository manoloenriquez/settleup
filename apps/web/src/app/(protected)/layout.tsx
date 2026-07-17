import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { AppNav } from "@/components/layout/AppNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OutboxProvider } from "@/components/OutboxProvider";
import { PendingChangesPopover } from "@/components/PendingChangesPopover";


export default async function ProtectedLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  return (
    <OutboxProvider>
      <div className="min-h-screen bg-slate-50">
        <OfflineBanner />
        <AppNav
          profile={{
            email: profile.email,
            role: profile.role,
            full_name: profile.full_name,
          }}
        />

        {/* Page content — extra bottom padding on mobile so the tab bar never overlaps content */}
        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 pb-28 md:pb-8">{children}</main>

        <BottomNav />
        <InstallPrompt />
        <PendingChangesPopover />
      </div>
    </OutboxProvider>
  );
}
