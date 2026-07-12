import type { Metadata } from "next";
import Link from "next/link";
import { ROUTES } from "@template/shared";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthHeader } from "@/components/auth/AuthHeader";

export const metadata: Metadata = { title: "Reset Password" };

export default function ForgotPasswordPage(): React.ReactElement {
  return (
    <div className="w-full max-w-sm animate-fade-in">
      <AuthHeader title="Forgot your password?" description="We'll send you a reset link" />

      <div className="rounded-card border border-border-subtle bg-surface p-7 shadow-card">
        <ForgotPasswordForm />
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Remember your password?{" "}
        <Link href={ROUTES.LOGIN} className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
