import type { Metadata } from "next";
import Link from "next/link";
import { ROUTES } from "@template/shared";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthHeader } from "@/components/auth/AuthHeader";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage(): React.ReactElement {
  return (
    <div className="w-full max-w-sm animate-fade-in">
      <AuthHeader title="Create an account" description="Start splitting with your group" />

      {/* Card */}
      <div className="rounded-card border border-border-subtle bg-surface p-7 shadow-card">
        <RegisterForm />
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href={ROUTES.LOGIN} className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
