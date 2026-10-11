import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";

export default async function UpdatePasswordPage(): Promise<React.ReactElement> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return (
    <section className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">Choose a new password</h1>
      {user ? (
        <UpdatePasswordForm />
      ) : (
        <p>
          This reset link has expired or is invalid.{" "}
          <Link className="text-brand-700 underline" href="/forgot-password">
            Request a new link
          </Link>
          .
        </p>
      )}
    </section>
  );
}
