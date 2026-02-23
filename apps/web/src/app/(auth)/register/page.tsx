import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href={ROUTES.HOME} className="text-2xl font-extrabold text-slate-900">
          {APP_NAME}
        </Link>
        <p className="mt-2 text-sm text-slate-600">Create your account</p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <RegisterForm />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Already have an account?{" "}
        <Link href={ROUTES.LOGIN} className="font-medium text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
