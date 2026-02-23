import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export const metadata: Metadata = { title: "Join the Waitlist" };

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      {/* Back link */}
      <Link
        href={ROUTES.HOME}
        className="mb-8 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        ← Back to home
      </Link>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-slate-900">{APP_NAME}</h1>
          <p className="mt-2 text-slate-600">
            Be the first to know when we launch. No spam, ever.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <WaitlistForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Already have an account?{" "}
          <Link href={ROUTES.LOGIN} className="text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
