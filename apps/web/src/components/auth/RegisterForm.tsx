"use client";

import { useState, useTransition } from "react";
import { signUp } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { APP_NAME } from "@template/shared";
import { Eye, EyeOff, UserPlus, Mail } from "lucide-react";

function ConfirmEmailState(): React.ReactElement {
  return (
    <div className="text-center py-4">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
        <Mail size={24} className="text-indigo-600" />
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
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (awaitingConfirmation) return <ConfirmEmailState />;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await signUp(null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setAwaitingConfirmation(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-900">{APP_NAME}</h2>
        <p className="mt-1 text-sm text-slate-500">Create your account</p>
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
        label="Email"
        placeholder="you@example.com"
        required
        autoComplete="email"
        autoFocus
      />

      <div className="relative">
        <Input
          name="password"
          type={showPassword ? "text" : "password"}
          label="Password"
          placeholder="8+ characters"
          required
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 transition-colors"
          tabIndex={-1}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <Input
        name="confirmPassword"
        type={showPassword ? "text" : "password"}
        label="Confirm password"
        placeholder="••••••••"
        required
        autoComplete="new-password"
      />

      <Button type="submit" isLoading={pending} leftIcon={UserPlus} className="w-full" size="lg">
        Create account
      </Button>
    </form>
  );
}
