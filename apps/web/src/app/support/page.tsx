import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/branding";
import { APP_NAME } from "@template/shared";
export default function SupportPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Contact {APP_NAME}</h1>
      {SUPPORT_EMAIL ? (
        <p className="mt-4">
          For help with your account or a group, email{" "}
          <a className="underline" href={SUPPORT_HREF}>
            {SUPPORT_EMAIL}
          </a>
          . Please avoid sending payment credentials or private receipts.
        </p>
      ) : (
        <p className="mt-4">
          This preview does not have a support mailbox yet. Please contact the person who shared it
          with you.
        </p>
      )}
    </main>
  );
}
