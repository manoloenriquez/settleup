import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset Password" };

export default function ForgotPasswordPage(): React.ReactElement {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <Link href={ROUTES.HOME} className="text-2xl font-extrabold text-slate-900">
          {APP_NAME}
        </Link>
        <p className="mt-2 text-sm text-slate-600">Reset your password</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Remember your password?{" "}
        <Link href={ROUTES.LOGIN} className="font-medium text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
