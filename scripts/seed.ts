/**
 * Demo data seed for a real Supabase project.
 *
 *   npm run db:seed            # seed (skips if demo data already exists)
 *   npm run db:seed -- --reset # remove previous demo data first
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local. In local demo mode
 * (NEXT_PUBLIC_LOCAL_DEMO=1) you don't need this: the app seeds its embedded
 * database automatically on first start.
 */
import { config } from "dotenv";
import { seedDemoData, DEMO_ACCOUNTS } from "../src/lib/demo/seed";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_DEMO_PASSWORD || "Demo@PartnerBridge2026";

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env vars. Copy .env.example to .env.local and fill it in.");
  console.error("(For local demo mode without Supabase, set NEXT_PUBLIC_LOCAL_DEMO=1 and just run the app.)");
  process.exit(1);
}

seedDemoData({ url, anonKey, serviceKey, password }, console.log, { reset: process.argv.includes("--reset") })
  .then(() => {
    console.log(`\nSign in with any of these accounts (password: value of SEED_DEMO_PASSWORD):`);
    console.table(DEMO_ACCOUNTS);
  })
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
