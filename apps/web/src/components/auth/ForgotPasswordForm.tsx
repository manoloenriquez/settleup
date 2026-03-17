"use client";

import { useState, useTransition } from "react";
import { forgotPassword } from "@/app/actions/forgot-password";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Mail } from "lucide-react";

export function ForgotPasswordForm(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      await forgotPassword(null, formData);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Mail size={20} className="text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Check your email</h2>
        <p className="text-sm text-slate-500">
          If an account exists for that email, we&apos;ve sent a password reset link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-900">Reset your password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        required
        autoComplete="email"
        autoFocus
      />

      <Button type="submit" isLoading={pending} leftIcon={Mail} className="w-full" size="lg">
        Send reset link
      </Button>
    </form>
  );
}
