import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-slate-700">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Template terms — requires legal review before launch.</p>
      <h2>1. The service</h2>
      <p>PartnerBridge is a marketplace and collaboration tool that helps businesses discover each other and manage partnerships. PartnerBridge is not a party to any partnership, agreement or deal between companies.</p>
      <h2>2. Accounts and companies</h2>
      <p>You must provide accurate information and have authority to act for any company you register. You are responsible for your team members&apos; access and actions.</p>
      <h2>3. Verification</h2>
      <p>A verified badge indicates that our team reviewed submitted registration evidence. It is not an endorsement or a guarantee of a company&apos;s performance, solvency or conduct. Perform your own due diligence.</p>
      <h2>4. Agreements and approvals</h2>
      <p>Approvals recorded in workspaces indicate internal acceptance only and are not legally binding electronic signatures. Legally binding execution must be done through a qualified e-signature provider or in writing.</p>
      <h2>5. Acceptable use</h2>
      <p>No spam, misleading listings, impersonation, harassment or unlawful content. We may remove content, suspend companies or users, and cancel requests that violate these terms.</p>
      <h2>6. Subscriptions</h2>
      <p>Paid plans are billed in advance in INR through our payment processor. Cancellations take effect at the end of the paid period. Prices shown are proposed launch prices and may change with notice.</p>
      <h2>7. Liability</h2>
      <p>The service is provided &quot;as is&quot;. To the extent permitted by law, PartnerBridge is not liable for losses arising from partnerships formed through the platform.</p>
      <h2>8. Governing law</h2>
      <p>These terms are governed by the laws of India, subject to final legal review.</p>
    </article>
  );
}
