import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage(): React.ReactElement {
  return (
    <div className="w-full max-w-sm animate-fade-in">
      {/* Brand */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <Link href={ROUTES.HOME} className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-md group-hover:bg-brand-700 transition-colors">
            <span className="text-white text-base font-bold">S</span>
          </div>
          <span className="text-xl font-extrabold text-slate-900 tracking-tight">{APP_NAME}</span>
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sign in to continue</p>
        </div>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <LoginForm />
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href={ROUTES.REGISTER} className="font-semibold text-brand-600 hover:text-brand-700">
          Create one
        </Link>
      </p>
    </div>
  );
}
