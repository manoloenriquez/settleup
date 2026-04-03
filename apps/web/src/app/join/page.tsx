import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JoinGroupForm } from "@/components/groups/JoinGroupForm";

export const metadata = { title: "Join Group" };

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function JoinPage({ searchParams }: Props): Promise<React.ReactElement> {
  const { code } = await searchParams;

  // If authenticated, show the join form; otherwise redirect to login with code preserved
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectTo = code ? `/join?code=${encodeURIComponent(code)}` : "/join";
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Join a Group</h1>
          <p className="mt-2 text-slate-500">
            Enter the invite code shared by your group admin.
          </p>
        </div>
        <JoinGroupForm initialCode={code} />
      </div>
    </div>
  );
}
