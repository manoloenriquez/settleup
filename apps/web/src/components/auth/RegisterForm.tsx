"use client";

import { useState, useTransition } from "react";
import { signUp } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { safeReturnPath } from "@template/shared";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resendConfirmation } from "@/app/actions/recovery";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function RegisterForm(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const searchParams = useSearchParams();
  const destination = safeReturnPath(searchParams.get("redirectTo"));
  const [email, setEmail] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [message, setMessage] = useState("");

  if (awaitingConfirmation)
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p>We sent a confirmation link to {email}. Open it to continue to your group.</p>
        <p className="text-sm text-slate-500">Check your spam folder if it does not arrive.</p>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <Button
          isLoading={pending}
          onClick={() => {
            if (Date.now() < resendAt) {
              setMessage("Please wait a minute before resending.");
              return;
            }
            startTransition(async () => {
              const result = await resendConfirmation(email, destination);
              setError(result.error);
              setResendAt(Date.now() + 60_000);
              if (!result.error) setMessage("Confirmation email sent.");
            });
          }}
        >
          Resend confirmation
        </Button>
        <button
          type="button"
          className="block text-sm text-brand-700"
          onClick={() => {
            setAwaitingConfirmation(false);
            setError(null);
          }}
        >
          Change email address
        </button>
      </div>
    );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("redirectTo", destination);
    setEmail(String(formData.get("email") ?? ""));

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
        defaultValue={email}
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
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
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

      <div className="relative my-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-slate-400">or</span>
        </div>
      </div>

      <GoogleSignInButton label="Sign up with Google" />
      <p className="text-xs text-slate-500">
        By creating an account, you agree to our{" "}
        <Link className="underline" href="/terms">
          Terms
        </Link>{" "}
        and acknowledge our{" "}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
