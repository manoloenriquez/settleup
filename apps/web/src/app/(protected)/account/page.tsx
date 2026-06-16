import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ChevronRight, MessageCircle, Shield, LogOut } from "lucide-react";
import { BETA_SUPPORT_EMAIL, ROUTES } from "@template/shared";
import { requireAuth } from "@/lib/supabase/guards";
import { cachedProfile } from "@/lib/supabase/queries";
import { signOut } from "@/app/actions/auth";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage(): Promise<React.ReactElement> {
  await requireAuth();
  const profile = await cachedProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your settings and data.</p>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Settings</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Link
            href={ROUTES.PAYMENT_SETTINGS}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CreditCard size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Payment Settings</p>
              <p className="text-xs text-slate-500">GCash, bank details, QR code</p>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
          </Link>
          <a
            href={`mailto:${BETA_SUPPORT_EMAIL}?subject=SettleUp%20beta%20feedback`}
            className="flex items-center gap-3 border-t border-slate-100 px-4 py-3.5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <MessageCircle size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Beta feedback</p>
              <p className="text-xs text-slate-500">Report bugs or tell us what felt confusing</p>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
          </a>
          {isAdmin && (
            <Link
              href={ROUTES.ADMIN}
              className="flex items-center gap-3 border-t border-slate-100 px-4 py-3.5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Shield size={18} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Admin</p>
                <p className="text-xs text-slate-500">Manage the platform</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          )}
          <form action={signOut} className="border-t border-slate-100">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <LogOut size={18} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Sign out</p>
                <p className="text-xs text-slate-500">{profile?.email}</p>
              </div>
            </button>
          </form>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">Danger zone</h2>
        <DeleteAccountSection />
      </section>
    </div>
  );
}
