import { SUPPORT_HREF, SUPPORT_EMAIL } from "@/lib/branding";
import type { Metadata } from "next";
import { APP_NAME } from "@template/shared";

export const metadata: Metadata = { title: "Privacy Policy" };

const EFFECTIVE_DATE = "October 8, 2026";

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="space-y-6 text-slate-700 leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>
      </header>

      <p>
        This Privacy Policy explains what information {APP_NAME} (&quot;we&quot;, &quot;our&quot;)
        collects, how we use it, and the choices you have. {APP_NAME} is intended for personal,
        non-commercial use.
      </p>

      <Section title="Without an account">
        <p>
          You can use {APP_NAME} on iPhone without an account. Expenses you record that way, your
          app preferences and any Assistant conversation stay on your device. We do not receive them.
        </p>
      </Section>

      <Section title="What we collect when you have an account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account information:</strong> your email address and name, and the identifier
            from Sign in with Apple or Google if you use them.
          </li>
          <li>
            <strong>Your own expenses:</strong> descriptions, amounts, currencies, categories, dates
            and notes, synced so they are available on your other devices.
          </li>
          <li>
            <strong>Shared groups:</strong> group names, the names you or other members enter for
            people (including people without an account), expenses, splits, payments, comments and
            notes.
          </li>
          <li>
            <strong>Payment details:</strong> GCash or bank details and payment QR images you choose
            to save, and details an organizer enters for a member without an account (shown as
            &quot;added by&quot; that organizer and not verified).
          </li>
          <li>
            <strong>Device token for notifications</strong>, if you allow notifications.
          </li>
          <li>
            <strong>Product usage events:</strong> a fixed list of actions (for example
            &quot;expense saved&quot; or &quot;link copied&quot;) with limited categories such as
            how an expense was entered. These events never contain names, amounts, notes, receipt
            content or messages.
          </li>
          <li>
            <strong>Crash reports:</strong> when crash reporting is enabled, technical details of
            errors. They exclude expense content, request bodies and IP addresses.
          </li>
        </ul>
      </Section>

      <Section title="Receipts and the Assistant">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            On iPhone, receipt scanning, the Assistant and other smart features run on your device
            with Apple Intelligence. Your photos and messages are not sent to us or to any AI
            provider. Only the expense you choose to save is stored, like any other expense.
          </li>
          <li>
            On the web, a receipt photo you upload is read on our server to fill in the expense and
            is not stored after that.
          </li>
          <li>No third-party AI provider receives your data, and we do not use it to train AI models.</li>
        </ul>
      </Section>

      <Section title="Sharing">
        <p>
          We do not sell or rent your data. We use Supabase to store data and authenticate you, and,
          when enabled, Expo to deliver notifications and Sentry for crash reports. Members of a
          group can see that group&apos;s expenses, payments and member names.
        </p>
      </Section>

      <Section title="Share links">
        <p>
          A group or balance link lets anyone who has it view that group&apos;s summary without an
          account. Payment details appear on a link only if you turned that on for your details, and
          a group admin can hide them for the group. Admins can turn a group link off or replace it
          with a new one at any time. Treat links like private URLs.
        </p>
      </Section>

      <Section title="Your rights and account deletion">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You can correct your data in the app or ask us for an export.</li>
          <li>
            You can delete your account from <em>Account → Delete Account</em>. This deletes your own
            synced expenses, payment details and QR images, notification tokens and comments.
            Expenses and payments in shared groups stay in those groups,
            because they are part of the other members&apos; records; groups you owned become
            read-only unless you transfer ownership first.
          </li>
          <li>Removing the app deletes the data stored only on your device.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          Questions or requests:{" "}
          <a href={SUPPORT_HREF} className="text-brand-600 hover:text-brand-700">
            {SUPPORT_EMAIL ?? "Contact support"}
          </a>
        </p>
      </Section>

      <p className="text-sm text-slate-500">
        This policy may change as the product evolves. We will update the effective date above when
        it does.
      </p>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
