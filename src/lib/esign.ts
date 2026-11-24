import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Optional third-party e-signature integration.
 *
 * PartnerBridge records *internal approvals* only — those are NOT legally valid
 * electronic signatures. For legally binding signatures, configure a provider
 * (e.g. Leegality / Zoho Sign / DocuSign) by implementing ESignProvider and
 * setting ESIGN_PROVIDER + ESIGN_API_KEY. See docs/INTEGRATIONS.md.
 */
export interface ESignEnvelope {
  envelopeId: string;
  status: "sent" | "completed" | "declined" | "voided";
  signingUrl?: string;
}

export interface ESignProvider {
  name: string;
  createEnvelope(input: { pdfUrl: string; title: string; signers: { name: string; email: string }[]; callbackUrl: string }): Promise<ESignEnvelope>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

export function esignStatus() {
  const { esignProvider, esignApiKey } = serverEnv();
  return { configured: Boolean(esignProvider && esignApiKey), provider: esignProvider || null };
}

export function getESignProvider(): ESignProvider | null {
  const { configured, provider } = esignStatus();
  if (!configured) return null;
  // Provider adapters are intentionally not bundled: each requires a commercial account,
  // API credentials and legal review. Add an adapter here and return it.
  throw new Error(`E-signature provider "${provider}" is configured but no adapter is implemented. See docs/INTEGRATIONS.md.`);
}
