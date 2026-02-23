import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage(): React.ReactElement {
  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href={ROUTES.HOME} className="text-2xl font-extrabold text-slate-900">
          {APP_NAME}
        </Link>
        <p className="mt-2 text-sm text-slate-600">Sign in to your account</p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Don&apos;t have an account?{" "}
        <Link href={ROUTES.REGISTER} className="font-medium text-indigo-600 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
