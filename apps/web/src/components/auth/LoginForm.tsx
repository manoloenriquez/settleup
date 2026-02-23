"use client";

import { useState, useTransition } from "react";
import { signIn } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginForm(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await signIn(null, formData);
      // Only reaches here on failure — success calls redirect() on the server.
      if (result.error) setError(result.error);
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

      <div className="space-y-1">
        <Input
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" isLoading={pending} className="w-full" size="lg">
        Sign in
      </Button>
    </form>
  );
}
