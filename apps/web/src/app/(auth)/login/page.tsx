import type { Metadata } from "next";
import Link from "next/link";
import { ROUTES } from "@template/shared";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthHeader } from "@/components/auth/AuthHeader";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage(): React.ReactElement {
  return (
    <div className="w-full max-w-sm animate-fade-in">
      <AuthHeader title="Welcome back" description="Sign in to continue" />

      {/* Card */}
      <div className="rounded-card border border-border-subtle bg-surface p-7 shadow-card">
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
