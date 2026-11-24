import { LOCAL_ANON_KEY, LOCAL_INTERNAL_URL } from "@/lib/local-supabase/config";

/** Local demo mode: embedded database + dummy data, no Supabase project needed. */
const localDemo = process.env.NEXT_PUBLIC_LOCAL_DEMO === "1" && !process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Centralised environment access. Server-only secrets are read lazily so they never reach client bundles. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  localDemo,
  /** Static, read-only snapshot build (e.g. GitHub Pages): no server behind the pages. */
  staticPreview: process.env.NEXT_PUBLIC_STATIC_PREVIEW === "1",
  /** Set when the app is served under a sub-path (e.g. /partnerbridge on GitHub Pages). */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  supabaseUrl: localDemo ? LOCAL_INTERNAL_URL : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
  supabaseAnonKey: localDemo ? LOCAL_ANON_KEY : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""),
  googleAuth: !localDemo && process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
  azureAuth: !localDemo && process.env.NEXT_PUBLIC_AUTH_AZURE_ENABLED === "true",
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
};

export function isSupabaseConfigured() {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "PartnerBridge <onboarding@resend.dev>",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    esignProvider: process.env.ESIGN_PROVIDER ?? "",
    esignApiKey: process.env.ESIGN_API_KEY ?? "",
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}
