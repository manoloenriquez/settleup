"use client";

import { useState, useTransition } from "react";
import { joinWaitlist } from "@/app/actions/waitlist";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function SuccessState() {
  return (
    <div className="text-center py-4">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-6 w-6 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900">You're on the list!</h3>
      <p className="mt-2 text-sm text-slate-600">
        We'll reach out as soon as we're ready for you.
      </p>
    </div>
  );
}

export function WaitlistForm(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (success) return <SuccessState />;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await joinWaitlist(null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900">Request early access</h2>
        <p className="text-sm text-slate-500">Drop your email and we'll be in touch.</p>
      </div>

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
        label="Email address"
        placeholder="you@example.com"
        required
        autoComplete="email"
        autoFocus
      />

      <Button type="submit" isLoading={pending} className="w-full" size="lg">
        Join the waitlist
      </Button>
    </form>
  );
}
