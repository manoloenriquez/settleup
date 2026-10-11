import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { PaymentProfileForm } from "@/components/groups/PaymentProfileForm";
import { Card, CardContent } from "@/components/ui/Card";

export default async function AccountPaymentPage(): Promise<React.ReactElement> {
  const profileResult = await getPaymentProfile();

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-lg mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-slate-600 transition-colors font-medium">Home</Link>
        <ChevronRight size={12} />
        <span className="text-slate-600 font-medium">Payment Settings</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <CreditCard size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Payment Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Shared across all groups, shown to friends with your balance.</p>
        </div>
      </div>

      {/* Never show an editable form over details that didn't load: saving it
          would replace the real details with blanks. */}
      {profileResult.error ? (
        <Card>
          <CardContent>
            <p className="text-sm font-semibold text-slate-900">Couldn&apos;t load your payment details</p>
            <p className="mt-1 text-sm text-slate-600">
              Your saved details are safe. Reload the page to try again.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <PaymentProfileForm initial={profileResult.data ?? null} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
