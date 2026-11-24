import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_p]:text-slate-700 [&_ul]:mt-3 [&_ul]:space-y-1 [&_li]:text-slate-700">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Template policy for the PartnerBridge platform. It is designed around India&apos;s Digital Personal Data Protection Act, 2023 and must be reviewed by qualified legal counsel before launch.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: name, work email, designation, phone and profile photo.</li>
        <li>Company data: profile information, verification documents and contact details you provide.</li>
        <li>Collaboration data: requests, messages, tasks, documents, agreements and deals created in workspaces.</li>
        <li>Technical data: sign-in sessions, security logs, IP address for rate limiting and audit, and push-notification subscriptions you enable.</li>
      </ul>
      <h2>Why we use it (purposes)</h2>
      <ul>
        <li>To operate your account and the marketplace, and to deliver features you request.</li>
        <li>To verify companies and keep the platform safe (moderation, fraud and spam prevention).</li>
        <li>To send notifications according to your preferences.</li>
        <li>To process subscription payments through our payment processor (Razorpay). We never store card details.</li>
      </ul>
      <h2>Who can see your data</h2>
      <p>Published company profiles are public. Private contact details are visible only to your team and active partners unless you choose to show them. Workspace content is visible only to authorised members of the two participating companies. Platform moderators can review company profiles, opportunities and reports, but do not automatically receive access to private partnership documents.</p>
      <h2>Your rights</h2>
      <ul>
        <li>Access and export your personal data (Settings → Privacy & data → Export).</li>
        <li>Correct your data at any time in your profile.</li>
        <li>Erase your account (Settings → Privacy & data → Delete account).</li>
        <li>Withdraw consent for optional processing such as email or push notifications.</li>
        <li>Raise a grievance with our Grievance Officer (contact details to be published before launch).</li>
      </ul>
      <h2>Retention & security</h2>
      <p>Data is stored in a managed PostgreSQL database with row-level security, encrypted in transit and at rest by our infrastructure providers. Audit and payment records may be retained as required by law. Offline caches on your device never include private company data, and are cleared on sign-out.</p>
      <h2>Contact</h2>
      <p>Use the contact form on our home page for privacy questions.</p>
    </article>
  );
}
