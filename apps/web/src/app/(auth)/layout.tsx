import { getSessionUser } from "@/lib/supabase/guards";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";

// Redirect to dashboard if the user is already signed in.
// Middleware handles this too — this is defence in depth.
export default async function AuthLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (user) redirect(ROUTES.DASHBOARD);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      {children}
    </div>
  );
}
