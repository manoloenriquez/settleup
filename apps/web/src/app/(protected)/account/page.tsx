import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ChevronRight } from "lucide-react";
import { ROUTES } from "@template/shared";
import { requireAuth } from "@/lib/supabase/guards";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage(): Promise<React.ReactElement> {
  await requireAuth();

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
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">Danger zone</h2>
        <DeleteAccountSection />
      </section>
    </div>
  );
}
