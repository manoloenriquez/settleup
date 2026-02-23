"use client";

import { useState, useTransition } from "react";
import { signUp } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function ConfirmEmailState() {
  return (
    <div className="text-center py-4">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
        <svg
          className="h-6 w-6 text-indigo-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900">Check your email</h3>
      <p className="mt-2 text-sm text-slate-600">
        We sent you a confirmation link. Click it to activate your account.
      </p>
    </div>
  );
}

export function RegisterForm(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // True when signup succeeded but email confirmation is required
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  if (awaitingConfirmation) return <ConfirmEmailState />;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await signUp(null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        // If signUp redirected (email confirmation off) this code never runs.
        // If we reach here, email confirmation is required.
        setAwaitingConfirmation(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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

      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="8+ characters"
        required
        autoComplete="new-password"
      />

      <Input
        name="confirmPassword"
        type="password"
        label="Confirm password"
        placeholder="••••••••"
        required
        autoComplete="new-password"
      />

      <Button type="submit" isLoading={pending} className="w-full" size="lg">
        Create account
      </Button>
    </form>
  );
}
