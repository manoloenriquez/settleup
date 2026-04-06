import { getSessionUser } from "@/lib/supabase/guards";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";

// Redirect to dashboard if the user is already signed in.
// Middleware handles this too — this is defence in depth.
export default async function AuthLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (user) redirect(ROUTES.DASHBOARD);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #eef2ff 0%, #f8faff 40%, #f0fdf4 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="relative w-full flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}
