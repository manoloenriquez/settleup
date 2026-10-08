import Link from "next/link";

export default function AccountClosedPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Your app account is closed</h1>
      <p className="my-4">
        Your identity and payment details have been removed from this app. Shared expense records
        remain with the groups. Your login in other applications is unaffected.
      </p>
      <Link className="underline" href="/">
        Return home
      </Link>
    </main>
  );
}
