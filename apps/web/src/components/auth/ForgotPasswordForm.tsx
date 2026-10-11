"use client";

import { useState, useTransition } from "react";
import { forgotPassword } from "@/app/actions/forgot-password";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Mail } from "lucide-react";

export function ForgotPasswordForm({ expired = false }: { expired?: boolean }): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await forgotPassword(null, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
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
      {expired && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          This reset link has expired or was already used. Request a new link below.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

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
