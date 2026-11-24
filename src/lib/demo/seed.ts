/**
 * Fictional demo data for PartnerBridge. Shared by the CLI seeder (scripts/seed.ts,
 * real Supabase) and local demo mode (embedded database). All companies are
 * FICTIONAL and flagged is_demo = true so the UI labels them "Demo".
 *
 * Workflow transitions (create company, accept request, accept application) run
 * through the real RPCs while signed in as the demo users, so seeding exercises
 * the same authorization path as the app.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, subDays } from "date-fns";

export type SeedTarget = { url: string; anonKey: string; serviceKey: string; fetch?: typeof fetch; password: string };

export const DEMO_DOMAIN = "partnerbridge.demo";
const DOMAIN = DEMO_DOMAIN;

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const iso = (d: Date) => d.toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);

interface CompanySeed {
  key: string;
  name: string;
  industry: string;
  sub: string;
  city: string;
  state: string;
  size: string;
  year: number;
  website: string;
  short: string;
  overview: string;
  mission: string;
  capabilities: string[];
  markets: string[];
  locations: string[];
  served: string[];
  goals: string[];
  offered: string[];
  wanted: string[];
  services: { name: string; kind: "product" | "service"; description: string }[];
  verified: boolean;
  featured: boolean;
  plan: "free" | "growth" | "business";
  owner: { name: string; designation: string };
}

const COMPANIES: CompanySeed[] = [
  {
    key: "northstar",
    name: "Northstar Digital Solutions",
    industry: "information-technology",
    sub: "web-app-development",
    city: "Bengaluru",
    state: "Karnataka",
    size: "51-200",
    year: 2014,
    website: "https://northstar-digital.example",
    short: "Custom web and mobile applications for growing businesses — from e-commerce storefronts to internal operations platforms.",
    overview:
      "Northstar Digital Solutions is a product engineering studio that designs and builds web platforms, mobile apps and integrations for SMBs and mid-market companies. Our teams work in React, Next.js, Node.js and Flutter, with a strong focus on performance, accessibility and maintainable code.\n\nWe partner with agencies and consultancies who need a dependable engineering arm, and with marketing firms whose clients need conversion-focused websites.",
    mission: "Help growing businesses ship reliable digital products faster, without building large in-house teams.",
    capabilities: ["React", "Next.js", "Mobile apps", "E-commerce", "API integrations", "UI/UX design"],
    markets: ["SMBs", "Retail", "Hospitality", "Logistics"],
    locations: ["Karnataka", "Maharashtra", "Tamil Nadu", "UAE"],
    served: ["Retail", "Travel", "Logistics", "Food & Beverage"],
    goals: ["find-new-customers", "collaborate-on-marketing", "build-strategic-relationships"],
    offered: ["technology", "white-label", "referral"],
    wanted: ["marketing", "referral", "reseller"],
    services: [
      { name: "Custom web applications", kind: "service", description: "Next.js and Node.js platforms built for scale" },
      { name: "E-commerce development", kind: "service", description: "Shopify, headless and custom storefronts" },
      { name: "Mobile app development", kind: "service", description: "Flutter and React Native apps" },
      { name: "White-label development", kind: "service", description: "Engineering capacity for agencies under your brand" },
    ],
    verified: true,
    featured: true,
    plan: "business",
    owner: { name: "Aarav Mehta", designation: "Founder & CEO" },
  },
  {
    key: "greenleaf",
    name: "GreenLeaf Foods",
    industry: "food-beverage",
    sub: "packaged-foods",
    city: "Mysuru",
    state: "Karnataka",
    size: "201-500",
    year: 2009,
    website: "https://greenleaf-foods.example",
    short: "Manufacturer of millet-based snacks, breakfast mixes and ready-to-cook foods sold across South India.",
    overview:
      "GreenLeaf Foods manufactures healthy packaged foods from millets, pulses and regional grains. Our FSSAI-certified plant in Mysuru produces 40+ SKUs for modern trade, general trade and online channels.\n\nWe are expanding distribution across Karnataka, Kerala and Tamil Nadu and are looking for distributors, cold-chain logistics partners and private-label opportunities.",
    mission: "Make traditional, nutritious foods convenient for modern households.",
    capabilities: ["Food manufacturing", "Private label", "FSSAI certified", "Millet products", "Packaging"],
    markets: ["Retail", "Modern trade", "D2C", "HoReCa"],
    locations: ["Karnataka", "Kerala", "Tamil Nadu"],
    served: ["Retail", "Hospitality"],
    goals: ["enter-new-markets", "find-distributors", "increase-sales"],
    offered: ["manufacturing", "white-label", "supply-chain"],
    wanted: ["distributor", "supply-chain", "marketing"],
    services: [
      { name: "Millet snack range", kind: "product", description: "Baked and roasted millet snacks, 12 SKUs" },
      { name: "Breakfast mixes", kind: "product", description: "Dosa, upma and pongal ready mixes" },
      { name: "Private-label manufacturing", kind: "service", description: "Contract manufacturing for retail brands" },
    ],
    verified: true,
    featured: true,
    plan: "growth",
    owner: { name: "Kavya Rao", designation: "Director, Sales & Distribution" },
  },
  {
    key: "apex",
    name: "Apex Logistics",
    industry: "logistics-supply-chain",
    sub: "freight-trucking",
    city: "Chennai",
    state: "Tamil Nadu",
    size: "501-1000",
    year: 2006,
    website: "https://apex-logistics.example",
    short: "Pan-South India freight, warehousing and temperature-controlled logistics for FMCG and e-commerce brands.",
    overview:
      "Apex Logistics operates a fleet of 300+ vehicles including 60 reefer trucks, and 6 warehouses across Chennai, Bengaluru, Hyderabad and Kochi. We provide FTL/PTL freight, cold-chain distribution, and last-mile delivery for FMCG, pharma and e-commerce clients.",
    mission: "Move goods reliably and transparently across South India.",
    capabilities: ["Cold chain", "Warehousing", "FTL/PTL freight", "Last-mile delivery", "Fleet tracking"],
    markets: ["FMCG", "E-commerce", "Retail", "Pharma"],
    locations: ["Tamil Nadu", "Karnataka", "Kerala", "Telangana"],
    served: ["Food & Beverage", "Retail", "Healthcare"],
    goals: ["find-new-customers", "build-strategic-relationships", "share-resources"],
    offered: ["supply-chain", "distributor"],
    wanted: ["technology", "strategic-alliance"],
    services: [
      { name: "Cold-chain distribution", kind: "service", description: "2–8°C and frozen transport with live tracking" },
      { name: "Warehousing", kind: "service", description: "450,000 sq ft across six cities" },
      { name: "Last-mile delivery", kind: "service", description: "Same-day delivery in 4 metros" },
    ],
    verified: true,
    featured: false,
    plan: "growth",
    owner: { name: "Rahul Krishnan", designation: "Head of Business Development" },
  },
  {
    key: "brightwave",
    name: "BrightWave Marketing",
    industry: "marketing-advertising",
    sub: "digital-marketing",
    city: "Bengaluru",
    state: "Karnataka",
    size: "11-50",
    year: 2017,
    website: "https://brightwave-marketing.example",
    short: "Performance-driven digital marketing agency specialising in SEO, paid media and content for B2B and D2C brands.",
    overview:
      "BrightWave Marketing helps brands grow through measurable digital campaigns — SEO, Google and Meta ads, LinkedIn for B2B, and content marketing. We manage annual media budgets of over ₹12 crore for 45 active clients.\n\nWe frequently need reliable development partners to build landing pages and websites for our clients, and we refer development projects to trusted studios.",
    mission: "Turn marketing spend into predictable growth.",
    capabilities: ["SEO", "Paid media", "Content marketing", "Marketing automation", "Analytics"],
    markets: ["SMBs", "D2C", "B2B SaaS", "Retail"],
    locations: ["Karnataka", "Maharashtra", "Delhi NCR"],
    served: ["Retail", "Information Technology", "Travel"],
    goals: ["collaborate-on-marketing", "find-technology-providers", "increase-sales"],
    offered: ["marketing", "referral", "affiliate"],
    wanted: ["technology", "referral", "white-label"],
    services: [
      { name: "SEO & content", kind: "service", description: "Technical SEO, content strategy and link building" },
      { name: "Performance marketing", kind: "service", description: "Google, Meta and LinkedIn campaigns" },
      { name: "Co-marketing programs", kind: "service", description: "Joint webinars and campaigns with partners" },
    ],
    verified: false,
    featured: true,
    plan: "growth",
    owner: { name: "Sneha Iyer", designation: "Managing Partner" },
  },
  {
    key: "novatech",
    name: "NovaTech Systems",
    industry: "information-technology",
    sub: "saas",
    city: "Pune",
    state: "Maharashtra",
    size: "51-200",
    year: 2016,
    website: "https://novatech-systems.example",
    short: "Cloud inventory and distribution management software for manufacturers and distributors.",
    overview:
      "NovaTech Systems builds DistroCloud, a SaaS platform for inventory, order and route management used by 300+ distributors in India. We integrate with Tally, Zoho and leading logistics APIs.\n\nWe seek resellers and implementation partners, and integration partnerships with logistics and e-commerce platforms.",
    mission: "Bring enterprise-grade distribution software to every Indian distributor.",
    capabilities: ["SaaS", "Inventory management", "Integrations", "Mobile sales apps", "Analytics"],
    markets: ["Distributors", "Manufacturers", "FMCG"],
    locations: ["India"],
    served: ["Wholesale & Distribution", "Manufacturing"],
    goals: ["find-distributors", "expand-product-offerings", "enter-new-markets"],
    offered: ["technology", "integration", "reseller"],
    wanted: ["reseller", "integration", "referral"],
    services: [
      { name: "DistroCloud", kind: "product", description: "Inventory, order and route management SaaS" },
      { name: "Field sales app", kind: "product", description: "Mobile order taking for sales reps" },
      { name: "Implementation services", kind: "service", description: "Onboarding, data migration and training" },
    ],
    verified: true,
    featured: false,
    plan: "business",
    owner: { name: "Vikram Deshpande", designation: "VP Partnerships" },
  },
  {
    key: "urbannest",
    name: "UrbanNest Interiors",
    industry: "interior-design-architecture",
    sub: "commercial-interiors",
    city: "Hyderabad",
    state: "Telangana",
    size: "11-50",
    year: 2018,
    website: "https://urbannest-interiors.example",
    short: "Design-and-build interiors for offices, cafés and boutique hotels.",
    overview:
      "UrbanNest Interiors delivers turnkey interior projects — from concept design to execution — for offices, restaurants and boutique hospitality. We have completed 120+ projects across Telangana and Andhra Pradesh and partner with furniture manufacturers and real-estate developers.",
    mission: "Create spaces that work beautifully for the people in them.",
    capabilities: ["Commercial interiors", "Hospitality design", "Turnkey execution", "3D visualisation"],
    markets: ["Hospitality", "Corporate offices", "Real estate developers"],
    locations: ["Telangana", "Andhra Pradesh", "Karnataka"],
    served: ["Travel & Hospitality", "Real Estate"],
    goals: ["find-new-customers", "build-strategic-relationships"],
    offered: ["referral", "strategic-alliance"],
    wanted: ["manufacturing", "referral", "marketing"],
    services: [
      { name: "Office fit-outs", kind: "service", description: "Design & build for 2,000–50,000 sq ft" },
      { name: "Hospitality interiors", kind: "service", description: "Cafés, restaurants and boutique hotels" },
    ],
    verified: false,
    featured: false,
    plan: "free",
    owner: { name: "Farah Siddiqui", designation: "Principal Designer" },
  },
  {
    key: "bluepeak",
    name: "BluePeak Distributors",
    industry: "wholesale-distribution",
    sub: "fmcg-distribution",
    city: "Bengaluru",
    state: "Karnataka",
    size: "51-200",
    year: 2011,
    website: "https://bluepeak-distributors.example",
    short: "FMCG distributor serving 4,500+ retail outlets across Karnataka with van sales and modern-trade coverage.",
    overview:
      "BluePeak Distributors represents 18 food and personal-care brands across Karnataka, covering 4,500+ general-trade outlets and 120 modern-trade stores with a fleet of 35 delivery vans and a 40-member field sales team.",
    mission: "Give quality regional brands the reach of national players.",
    capabilities: ["FMCG distribution", "General trade", "Modern trade", "Van sales", "Credit management"],
    markets: ["Retail", "Modern trade", "General trade"],
    locations: ["Karnataka"],
    served: ["Food & Beverage", "Retail"],
    goals: ["expand-product-offerings", "increase-sales", "share-resources"],
    offered: ["distributor", "reseller"],
    wanted: ["manufacturing", "technology", "supply-chain"],
    services: [
      { name: "General trade distribution", kind: "service", description: "4,500+ outlets across 14 districts" },
      { name: "Modern trade listing support", kind: "service", description: "Listings and merchandising in 120 stores" },
    ],
    verified: true,
    featured: true,
    plan: "free",
    owner: { name: "Manjunath Gowda", designation: "Managing Director" },
  },
  {
    key: "horizon",
    name: "Horizon Travel Group",
    industry: "travel-hospitality",
    sub: "corporate-travel",
    city: "Kochi",
    state: "Kerala",
    size: "201-500",
    year: 2008,
    website: "https://horizon-travel.example",
    short: "Corporate travel management, MICE and curated holiday experiences across India and Southeast Asia.",
    overview:
      "Horizon Travel Group manages corporate travel for 200+ companies and organises MICE events and incentive trips. Our holidays division curates experiences in Kerala, the Northeast and Southeast Asia.\n\nWe look for technology partners for booking automation, marketing partners for destination campaigns, and hospitality partners.",
    mission: "Make business and leisure travel effortless and memorable.",
    capabilities: ["Corporate travel", "MICE", "Holiday packages", "Visa services"],
    markets: ["Corporates", "SMBs", "Travellers"],
    locations: ["Kerala", "Karnataka", "Tamil Nadu", "Singapore", "Thailand"],
    served: ["Information Technology", "Financial Services"],
    goals: ["find-technology-providers", "collaborate-on-marketing", "enter-new-markets"],
    offered: ["referral", "affiliate", "strategic-alliance"],
    wanted: ["technology", "marketing", "integration"],
    services: [
      { name: "Corporate travel management", kind: "service", description: "24×7 booking desk and expense reporting" },
      { name: "MICE & incentive trips", kind: "service", description: "Events for 20–2,000 attendees" },
    ],
    verified: false,
    featured: false,
    plan: "free",
    owner: { name: "Thomas Mathew", designation: "Director, Alliances" },
  },
];

export async function seedDemoData(target: SeedTarget, log: (msg: string) => void = console.log, opts: { reset?: boolean } = {}) {
  const URL_ = target.url;
  const ANON = target.anonKey;
  const PASSWORD = target.password;
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false }, ...(target.fetch ? { global: { fetch: target.fetch } } : {}) };
  const admin = createClient(URL_, target.serviceKey, clientOptions);

  async function signIn(email: string): Promise<SupabaseClient> {
    const c = createClient(URL_, ANON, clientOptions);
    const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`sign in ${email}: ${error.message}`);
    return c;
  }

  async function createUser(email: string, fullName: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) throw new Error(`create ${email}: ${error.message}`);
    await admin.from("profiles").update({ full_name: fullName, is_demo: true, onboarding_completed: true, ...extra }).eq("id", data.user.id);
    return data.user.id;
  }

  async function reset() {
    log("Removing previous demo data…");
    const { data: orgs } = await admin.from("organizations").select("id").eq("is_demo", true);
    const ids = (orgs ?? []).map((o) => o.id);
    if (ids.length) {
      await admin.from("partnerships").delete().or(`organization_a_id.in.(${ids.join(",")}),organization_b_id.in.(${ids.join(",")})`);
      await admin.from("organizations").delete().in("id", ids);
    }
    let page = 1;
    for (;;) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const demo = (data?.users ?? []).filter((u) => u.email?.endsWith(`@${DOMAIN}`));
      for (const u of demo) await admin.auth.admin.deleteUser(u.id);
      if (!data || data.users.length < 200) break;
      page++;
    }
  }

  async function uploadText(bucket: string, path: string, content: string, type = "application/pdf") {
    // Minimal valid one-page PDF so downloads open correctly.
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length ${content.length + 44}>>stream\nBT /F1 14 Tf 60 780 Td (${content.replace(/[()\\]/g, "")}) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
    const body = type === "application/pdf" ? pdf : content;
    const { error } = await admin.storage.from(bucket).upload(path, new Blob([body], { type }), { contentType: type, upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    return body.length;
  }

  async function main() {
    if (opts.reset) await reset();
    const { data: existing } = await admin.from("profiles").select("id").eq("email", `admin@${DOMAIN}`).maybeSingle();
    if (existing) {
      log("Demo data already present. Run with --reset to recreate.");
      return;
    }

    const [{ data: industries }, { data: categories }, { data: plans }] = await Promise.all([
      admin.from("industries").select("id, slug"),
      admin.from("partnership_categories").select("id, slug"),
      admin.from("subscription_plans").select("id, code"),
    ]);
    const ind = (s: string) => industries!.find((i) => i.slug === s)!.id;
    const cat = (s: string) => categories!.find((c) => c.slug === s)!.id;
    const planId = (s: string) => plans!.find((p) => p.code === s)!.id;

    log("Creating platform staff…");
    await createUser(`admin@${DOMAIN}`, "Platform Admin", { platform_role: "super_admin", designation: "Super Admin" });
    await createUser(`moderator@${DOMAIN}`, "Priya Nair", { platform_role: "moderator", designation: "Trust & Safety" });

    const org: Record<string, { id: string; ownerId: string; ownerEmail: string; client: SupabaseClient }> = {};

    log("Creating companies…");
    for (const [i, c] of COMPANIES.entries()) {
      const email = `${c.key}@${DOMAIN}`;
      const ownerId = await createUser(email, c.owner.name, { designation: c.owner.designation, phone: `+91 98450 ${String(10000 + i * 1111).slice(0, 5)}` });
      const client = await signIn(email);
      const orgId = must(await client.rpc("create_organization", { p_name: c.name, p_slug: c.key === "northstar" ? "northstar-digital-solutions" : c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") }), `create ${c.name}`) as string;
      org[c.key] = { id: orgId, ownerId, ownerEmail: email, client };

      must(
        await admin
          .from("organizations")
          .update({
            website: c.website,
            year_established: c.year,
            company_size: c.size,
            industry_id: ind(c.industry),
            sub_industry_id: ind(c.sub),
            registration_country: "India",
            country: "India",
            state: c.state,
            city: c.city,
            short_description: c.short,
            overview: c.overview,
            mission: c.mission,
            capabilities: c.capabilities,
            target_markets: c.markets,
            locations_served: c.locations,
            industries_served: c.served,
            partnership_goals: c.goals,
            social_links: { linkedin: `https://www.linkedin.com/company/${c.key}-demo` },
            privacy: { show_email: i % 2 === 0, show_phone: false, show_activity: true },
            verification_status: c.verified ? "verified" : i === 5 ? "pending" : "not_submitted",
            verified_at: c.verified ? iso(subDays(new Date(), 60 - i * 3)) : null,
            profile_status: "published",
            published_at: iso(subDays(new Date(), 200 - i * 15)),
            created_at: iso(subDays(new Date(), 210 - i * 15)),
            onboarding_step: 7,
            is_featured: c.featured,
            is_demo: true,
          })
          .eq("id", orgId),
        "update org",
      );
      await admin.from("organization_contacts").update({ email: `hello@${c.key}.example`, phone: `+91 80 4${i}12 34${i}0`, address: `${10 + i}, Business Park Road, ${c.city}, ${c.state}` }).eq("organization_id", orgId);
      await admin.from("company_services").insert(c.services.map((s, k) => ({ organization_id: orgId, ...s, sort_order: k })));
      await admin.from("company_partnership_preferences").insert([
        ...c.offered.map((s) => ({ organization_id: orgId, category_id: cat(s), direction: "offered" })),
        ...c.wanted.map((s) => ({ organization_id: orgId, category_id: cat(s), direction: "wanted" })),
      ]);
      if (c.verified || i === 5) {
        await admin.from("organization_verifications").insert({
          organization_id: orgId,
          status: c.verified ? "verified" : "pending",
          registration_country: "India",
          registration_type: "Private Limited Company",
          registration_number: `U72900KA${c.year}PTC0${10000 + i}`,
          domain: `${c.key}.example`,
          representative_name: c.owner.name,
          representative_designation: c.owner.designation,
          representative_email: email,
          documents: [],
          submitted_by: ownerId,
          submitted_at: iso(subDays(new Date(), 70 - i)),
          reviewed_at: c.verified ? iso(subDays(new Date(), 60 - i * 3)) : null,
          reviewer_notes: c.verified ? "Demo verification (fictional company)" : null,
        });
      }
      if (c.plan !== "free") {
        await admin.from("subscriptions").update({ status: "cancelled" }).eq("organization_id", orgId);
        await admin.from("subscriptions").insert({
          organization_id: orgId,
          plan_id: planId(c.plan),
          status: "active",
          billing_cycle: "monthly",
          current_period_start: iso(subDays(new Date(), 10)),
          current_period_end: iso(addDays(new Date(), 20)),
          provider: "manual",
        });
      }
    }

    // Extra team members for Northstar.
    log("Adding team members…");
    const managerId = await createUser(`manager@${DOMAIN}`, "Neha Kapoor", { designation: "Partnership Manager", active_organization_id: org.northstar!.id });
    const memberId = await createUser(`member@${DOMAIN}`, "Arjun Shetty", { designation: "Project Lead", active_organization_id: org.northstar!.id });
    await admin.from("organization_members").insert([
      { organization_id: org.northstar!.id, user_id: managerId, role: "partnership_manager", invited_by: org.northstar!.ownerId },
      { organization_id: org.northstar!.id, user_id: memberId, role: "member", permissions: [], invited_by: org.northstar!.ownerId },
    ]);
    await admin.from("organization_invitations").insert({ organization_id: org.northstar!.id, email: `designer@${DOMAIN}`, role: "member", token_hash: "demo-pending-invite-hash-not-usable", invited_by: org.northstar!.ownerId });

    // ── Opportunities ────────────────────────────────────────────────────
    log("Creating opportunities…");
    const opps: { key: string; org: string; cat: string; title: string; desc: string; caps: string[]; locs: string[]; model: string; days: number }[] = [
      { key: "gl-dist", org: "greenleaf", cat: "distributor", title: "Looking for distribution partners in Karnataka", desc: "GreenLeaf Foods is appointing distributors for our millet snack and breakfast-mix range across Karnataka districts outside Bengaluru. We provide marketing support, launch schemes and a dedicated sales manager. Ideal partners already service general-trade outlets with their own vans.", caps: ["FMCG distribution", "General trade", "Van sales"], locs: ["Karnataka"], model: "18–22% distributor margin plus quarterly volume incentives", days: 30 },
      { key: "bw-dev", org: "brightwave", cat: "white-label", title: "Seeking web development agencies for white-label projects", desc: "BrightWave needs reliable development studios to build landing pages and marketing websites for our clients under our brand. Expect 4–8 projects per month with clear briefs, design files and fixed budgets.", caps: ["Next.js", "Landing pages", "CMS"], locs: ["India"], model: "Fixed price per project, monthly invoicing", days: 21 },
      { key: "nt-res", org: "novatech", cat: "reseller", title: "Reseller & implementation partners for DistroCloud", desc: "Become a certified DistroCloud partner. Resell our distribution management SaaS, deliver implementation and training, and earn recurring commission on every subscription you bring.", caps: ["ERP implementation", "Software sales", "Training"], locs: ["Maharashtra", "Gujarat", "Karnataka", "Tamil Nadu"], model: "25% recurring revenue share + implementation fees", days: 45 },
      { key: "ht-tech", org: "horizon", cat: "technology", title: "Searching for technology integration partners for travel booking", desc: "Horizon Travel wants to automate corporate booking approvals and expense reporting. We're looking for a technology partner to build integrations with our booking desk and clients' HRMS tools.", caps: ["API integrations", "Workflow automation", "React"], locs: ["Kerala", "Remote"], model: "Project-based with option for revenue share on a productised offering", days: 25 },
      { key: "ax-mfg", org: "apex", cat: "strategic-alliance", title: "Cold-chain alliance with food manufacturers", desc: "Apex Logistics invites food and dairy manufacturers to a cold-chain alliance offering dedicated reefer capacity, shared warehousing and preferential rates for committed monthly volumes across South India.", caps: ["Food manufacturing", "Dairy", "Frozen foods"], locs: ["Tamil Nadu", "Karnataka", "Kerala"], model: "Volume-based contract rates", days: 40 },
      { key: "un-mfg", org: "urbannest", cat: "manufacturing", title: "Looking for manufacturing partners for custom furniture", desc: "UrbanNest needs furniture manufacturers who can produce custom loose furniture and joinery for hospitality projects with 4–6 week lead times and consistent finish quality.", caps: ["Furniture manufacturing", "Joinery", "Upholstery"], locs: ["Telangana", "Karnataka"], model: "Per-project purchase orders", days: 35 },
    ];
    const oppIds: Record<string, string> = {};
    for (const [i, o] of opps.entries()) {
      const r = must(
        await admin
          .from("partnership_opportunities")
          .insert({
            organization_id: org[o.org]!.id,
            category_id: cat(o.cat),
            title: o.title,
            description: o.desc,
            required_capabilities: o.caps,
            target_locations: o.locs,
            commercial_model: o.model,
            duration: "12 months, renewable",
            requirements: "Registered business with GST, references from two existing clients, and a named point of contact.",
            benefits: "Dedicated partner manager, co-marketing support and priority access to new products.",
            deadline: day(addDays(new Date(), o.days)),
            visibility: "public",
            status: "published",
            published_at: iso(subDays(new Date(), 20 - i * 2)),
            created_by: org[o.org]!.ownerId,
            is_demo: true,
          })
          .select("id")
          .single(),
        "opportunity",
      ) as { id: string };
      oppIds[o.key] = r.id;
    }

    // ── Applications ─────────────────────────────────────────────────────
    log("Creating applications…");
    const apply = async (key: string, applicant: string, proposal: string, status = "submitted") => {
      const r = must(
        await admin
          .from("opportunity_applications")
          .insert({ opportunity_id: oppIds[key], applicant_organization_id: org[applicant]!.id, proposal, capabilities: "See our company profile for coverage, team and references.", submitted_by: org[applicant]!.ownerId, status })
          .select("id")
          .single(),
        "application",
      ) as { id: string };
      return r.id;
    };
    const appBluepeak = await apply("gl-dist", "bluepeak", "BluePeak services 4,500+ outlets in Karnataka with 35 vans. We already distribute two regional snack brands and can add GreenLeaf's millet range to our Mysuru, Mandya and Tumakuru routes within 30 days.");
    await apply("bw-dev", "northstar", "Northstar has delivered 60+ marketing sites in Next.js with Lighthouse scores above 95. We can dedicate a 4-person pod to BrightWave's white-label pipeline with 5-day turnaround for standard landing pages.", "shortlisted");
    await apply("nt-res", "northstar", "We implement ERPs and custom tools for distributors in Karnataka and would like to resell and implement DistroCloud for our existing client base.", "under_review");
    await apply("ht-tech", "novatech", "Our integration team has built approval workflows and HRMS connectors for 40 enterprise clients and can deliver a booking-approval integration in 8 weeks.", "discussion");

    // Accept BluePeak's application through the real RPC (as GreenLeaf's owner).
    const pGreenBlue = must(await org.greenleaf!.client.rpc("accept_opportunity_application", { p_application: appBluepeak }), "accept application") as string;

    // ── Partnership requests ─────────────────────────────────────────────
    log("Creating partnership requests…");
    const request = async (from: string, to: string, c: string, subject: string, status: "sent" | "viewed" | "negotiation" | "rejected" | "draft" = "sent", daysAgo = 3) => {
      const r = must(
        await admin
          .from("partnership_requests")
          .insert({
            sender_organization_id: org[from]!.id,
            receiver_organization_id: org[to]!.id,
            category_id: cat(c),
            subject,
            introduction: `Hello from ${COMPANIES.find((x) => x.key === from)!.name}! We've followed your work and believe our customers overlap in a way that creates real value for both of us.`,
            proposed_collaboration: "We propose a 90-day pilot: exchange qualified referrals, run one joint campaign, and review results together before formalising a longer-term agreement.",
            expected_benefits: "New customers for both companies, shared marketing costs and a stronger combined offering.",
            commercial_model: "10% referral fee on first-year revenue from referred customers",
            status,
            sent_at: status === "draft" ? null : iso(subDays(new Date(), daysAgo)),
            viewed_at: ["viewed", "negotiation", "rejected"].includes(status) ? iso(subDays(new Date(), daysAgo - 1)) : null,
            responded_at: status === "rejected" ? iso(subDays(new Date(), daysAgo - 1)) : null,
            response_message: status === "rejected" ? "Thank you — we're not taking on new partners in this category this quarter." : null,
            expires_at: status === "draft" ? null : iso(addDays(new Date(), 30 - daysAgo)),
            created_by: org[from]!.ownerId,
            is_demo: true,
          })
          .select("id")
          .single(),
        "request",
      ) as { id: string };
      return r.id;
    };
    const rNorthBright = await request("brightwave", "northstar", "marketing", "Co-marketing & referral partnership: websites + growth marketing", "sent", 40);
    const rGreenApex = await request("greenleaf", "apex", "supply-chain", "Cold-chain distribution partnership for South India", "sent", 35);
    await request("horizon", "northstar", "technology", "Booking approval automation for corporate travel", "sent", 1);
    await request("urbannest", "northstar", "referral", "Referral partnership for office fit-out clients", "viewed", 4);
    await request("novatech", "bluepeak", "technology", "Pilot DistroCloud with BluePeak's field sales team", "negotiation", 6);
    await request("northstar", "novatech", "reseller", "Reseller partnership for DistroCloud in Karnataka", "sent", 2);
    await request("northstar", "horizon", "marketing", "Joint webinar on digital transformation in travel", "rejected", 12);
    await request("northstar", "greenleaf", "technology", "D2C storefront for GreenLeaf's online channel", "draft");

    // Accept two requests through the real RPC (as the receiving owners).
    const pNorthBright = must(await org.northstar!.client.rpc("accept_partnership_request", { p_request: rNorthBright, p_message: "Excited to work together!" }), "accept") as string;
    const pGreenApex = must(await org.apex!.client.rpc("accept_partnership_request", { p_request: rGreenApex, p_message: null }), "accept") as string;
    await admin.from("partnerships").update({ started_at: iso(subDays(new Date(), 38)) }).eq("id", pNorthBright);
    await admin.from("partnerships").update({ started_at: iso(subDays(new Date(), 33)) }).eq("id", pGreenApex);
    await admin.from("partnerships").update({ started_at: iso(subDays(new Date(), 12)) }).eq("id", pGreenBlue);
    await admin.from("partnership_members").insert({ partnership_id: pNorthBright, organization_id: org.northstar!.id, user_id: memberId, added_by: org.northstar!.ownerId });

    // ── Workspace content ────────────────────────────────────────────────
    log("Populating partnership workspaces…");
    const users = { north: org.northstar!.ownerId, bright: org.brightwave!.ownerId, green: org.greenleaf!.ownerId, apex: org.apex!.ownerId, blue: org.bluepeak!.ownerId };

    const msgs = async (pid: string, a: string, aUser: string, b: string, bUser: string, lines: [0 | 1, string, number][]) => {
      const { data: conv } = await admin.from("conversations").select("id").eq("partnership_id", pid).single();
      for (const [who, body, hoursAgo] of lines) {
        await admin.from("partnership_messages").insert({ conversation_id: conv!.id, partnership_id: pid, sender_id: who ? bUser : aUser, sender_organization_id: who ? b : a, body, created_at: iso(new Date(Date.now() - hoursAgo * 3600_000)) });
      }
      await admin.from("conversation_reads").insert([
        { conversation_id: conv!.id, user_id: aUser, organization_id: a, last_read_at: iso(new Date(Date.now() - 3 * 3600_000)) },
        { conversation_id: conv!.id, user_id: bUser, organization_id: b, last_read_at: iso(new Date()) },
      ]);
    };
    await msgs(pNorthBright, org.northstar!.id, users.north, org.brightwave!.id, users.bright, [
      [1, "Hi Aarav — thrilled to kick this off! Shall we start with the joint 'Website + Growth' package for SMB retailers?", 300],
      [0, "Absolutely. I've shared our standard scope doc in Documents. Could your team draft the campaign plan?", 296],
      [1, "Done — campaign plan uploaded. Also registered our first referral: Café Brew Co. needs a new site.", 120],
      [0, "Great, we'll pick it up this week. Neha from our side will be the day-to-day contact.", 30],
      [1, "Perfect. Let's sync Thursday on the webinar milestone.", 5],
    ]);
    await msgs(pGreenApex, org.greenleaf!.id, users.green, org.apex!.id, users.apex, [
      [0, "Thanks for accepting, Rahul. Our first priority is reefer capacity for the Kochi launch next month.", 200],
      [1, "We can allocate two reefer trucks twice a week from Chennai. Sharing the SLA draft in Agreements.", 190],
      [0, "Reviewed — looks good. We approved v2 on our side.", 20],
    ]);
    await msgs(pGreenBlue, org.greenleaf!.id, users.green, org.bluepeak!.id, users.blue, [
      [0, "Welcome aboard as our Karnataka distributor! Launch scheme details are in Documents.", 100],
      [1, "Thank you! Our team will begin outlet onboarding in Mysuru next Monday.", 90],
    ]);

    const tasks = async (pid: string, rows: [string, string | null, string | null, number, string, string][]) => {
      for (const [title, resp, assignee, due, priority, status] of rows) {
        await admin.from("partnership_tasks").insert({ partnership_id: pid, title, responsible_organization_id: resp, assignee_id: assignee, due_date: day(addDays(new Date(), due)), priority, status, completed_at: status === "done" ? iso(subDays(new Date(), 2)) : null, created_by: users.north });
      }
    };
    await tasks(pNorthBright, [
      ["Finalise joint 'Website + Growth' package pricing", org.northstar!.id, managerId, 3, "high", "in_progress"],
      ["Draft co-marketing campaign plan", org.brightwave!.id, users.bright, -5, "medium", "done"],
      ["Build landing page for joint offer", org.northstar!.id, memberId, 7, "medium", "todo"],
      ["Prepare webinar slides", org.brightwave!.id, users.bright, 10, "low", "todo"],
      ["Confirm referral fee invoicing process", null, null, -1, "urgent", "blocked"],
    ]);
    await tasks(pGreenApex, [
      ["Share Kochi launch volume forecast", org.greenleaf!.id, users.green, 2, "high", "in_progress"],
      ["Allocate reefer capacity for Kochi lane", org.apex!.id, users.apex, 6, "high", "todo"],
      ["Sign service level agreement", null, null, -3, "medium", "done"],
    ]);
    await tasks(pGreenBlue, [
      ["Onboard first 200 outlets in Mysuru", org.bluepeak!.id, users.blue, 14, "high", "in_progress"],
      ["Send launch scheme circular to sales team", org.greenleaf!.id, users.green, 1, "medium", "todo"],
    ]);
    const { data: t1 } = await admin.from("partnership_tasks").select("id").eq("partnership_id", pNorthBright).eq("status", "blocked").single();
    await admin.from("task_comments").insert([
      { task_id: t1!.id, partnership_id: pNorthBright, author_id: users.bright, body: "Our finance team needs a PO reference for each referral — can you confirm?" },
      { task_id: t1!.id, partnership_id: pNorthBright, author_id: managerId, body: "Yes, we'll include the deal ID from the Deals tab as the PO reference." },
    ]);

    const milestones = async (pid: string, rows: [string, number, number, string][]) => {
      for (const [title, dueIn, progress, status] of rows) {
        await admin.from("partnership_milestones").insert({ partnership_id: pid, title, target_date: day(addDays(new Date(), dueIn)), progress, status, completed_at: status === "completed" ? iso(addDays(new Date(), dueIn)) : null, created_by: users.north });
      }
    };
    await milestones(pNorthBright, [
      ["Joint offer launched", -10, 100, "completed"],
      ["First 3 referrals converted", 20, 33, "in_progress"],
      ["Joint webinar delivered", 25, 10, "planned"],
    ]);
    await milestones(pGreenApex, [
      ["SLA signed", -4, 100, "completed"],
      ["Kochi cold-chain lane live", 18, 40, "in_progress"],
    ]);
    await milestones(pGreenBlue, [["500 outlets activated in Karnataka", 45, 15, "in_progress"]]);

    const doc = async (pid: string, owner: string, by: string, title: string, category: string, access = "shared") => {
      const path = `p/${pid}/${crypto.randomUUID()}.pdf`;
      const size = await uploadText("partnership-files", path, `${title} - PartnerBridge demo document`);
      const { data } = await admin
        .from("partnership_documents")
        .insert({ partnership_id: pid, owner_organization_id: owner, title, category, access_level: access, storage_path: path, file_name: `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`, mime_type: "application/pdf", size_bytes: size, uploaded_by: by })
        .select("id")
        .single();
      await admin.from("document_versions").insert({ document_id: data!.id, partnership_id: pid, version: 1, storage_path: path, file_name: `${title}.pdf`, mime_type: "application/pdf", size_bytes: size, uploaded_by: by, change_note: "Initial upload" });
      await admin.from("document_access_logs").insert({ document_id: data!.id, partnership_id: pid, user_id: by, organization_id: owner, action: "upload", version: 1 });
    };
    await doc(pNorthBright, org.northstar!.id, users.north, "Joint offer scope", "commercial");
    await doc(pNorthBright, org.brightwave!.id, users.bright, "Co-marketing campaign plan", "marketing");
    await doc(pNorthBright, org.northstar!.id, managerId, "Internal margin analysis", "financial", "internal");
    await doc(pGreenApex, org.apex!.id, users.apex, "Reefer fleet capabilities", "operations");
    await doc(pGreenBlue, org.greenleaf!.id, users.green, "Karnataka launch scheme", "commercial");

    const agreementPath = `p/${pGreenApex}/${crypto.randomUUID()}.pdf`;
    await uploadText("partnership-files", agreementPath, "Cold-chain Service Level Agreement - demo");
    const { data: ag } = await admin
      .from("partnership_agreements")
      .insert({
        partnership_id: pGreenApex,
        title: "Cold-chain Service Level Agreement",
        agreement_type: "Service level agreement",
        status: "active",
        commercial_terms: "₹38/km per reefer trip; minimum 8 trips/month; 98% on-time delivery SLA with 2% credit per breach.",
        effective_date: day(subDays(new Date(), 4)),
        expiration_date: day(addDays(new Date(), 361)),
        renewal_date: day(addDays(new Date(), 330)),
        current_version: 2,
        storage_path: agreementPath,
        file_name: "cold-chain-sla.pdf",
        approval_a_by: users.green,
        approval_a_at: iso(subDays(new Date(), 5)),
        approval_b_by: users.apex,
        approval_b_at: iso(subDays(new Date(), 5)),
        created_by: users.apex,
      })
      .select("id")
      .single();
    await admin.from("agreement_versions").insert([
      { agreement_id: ag!.id, partnership_id: pGreenApex, version: 1, commercial_terms: "₹40/km per reefer trip", change_note: "Initial draft", created_by: users.apex },
      { agreement_id: ag!.id, partnership_id: pGreenApex, version: 2, commercial_terms: "₹38/km per reefer trip; minimum 8 trips/month", storage_path: agreementPath, file_name: "cold-chain-sla.pdf", change_note: "Rate revised after volume commitment", created_by: users.apex },
    ]);
    await admin.from("partnership_agreements").insert({
      partnership_id: pNorthBright,
      title: "Referral & Co-marketing Agreement",
      agreement_type: "Referral agreement",
      status: "under_review",
      commercial_terms: "10% referral fee on first-year revenue; co-marketing costs shared 50/50.",
      effective_date: day(addDays(new Date(), 5)),
      expiration_date: day(addDays(new Date(), 370)),
      approval_b_by: users.north,
      approval_b_at: iso(subDays(new Date(), 1)),
      created_by: users.bright,
    });

    const deal = async (pid: string, owner: string, ref: string | null, title: string, customer: string, stage: string, value: number, attributed?: number, verified?: number) => {
      const { data } = await admin
        .from("partnership_deals")
        .insert({
          partnership_id: pid,
          title,
          customer_name: customer,
          customer_company: customer,
          owner_organization_id: owner,
          owner_user_id: owner === org.northstar!.id ? managerId : users.bright,
          referral_source_organization_id: ref,
          stage,
          expected_value: value,
          attributed_revenue: attributed ?? null,
          verified_revenue: verified ?? null,
          verified_at: verified ? iso(subDays(new Date(), 3)) : null,
          verified_by: verified ? users.bright : null,
          expected_close_date: day(addDays(new Date(), 20)),
          closed_at: ["won", "lost"].includes(stage) ? iso(subDays(new Date(), 6)) : null,
          created_by: users.north,
          created_at: iso(subDays(new Date(), 25)),
        })
        .select("id")
        .single();
      if (ref && ref !== owner) {
        await admin.from("referrals").insert({ partnership_id: pid, deal_id: data!.id, from_organization_id: ref, to_organization_id: owner, lead_name: customer, status: stage === "won" ? "converted" : stage === "lost" ? "lost" : "open", created_by: users.north, created_at: iso(subDays(new Date(), 25)) });
      }
    };
    await deal(pNorthBright, org.northstar!.id, org.brightwave!.id, "Café Brew Co. website rebuild", "Café Brew Co.", "won", 280000, 280000, 265000);
    await deal(pNorthBright, org.northstar!.id, org.brightwave!.id, "Lotus Boutique Hotels booking site", "Lotus Boutique Hotels", "proposal", 650000);
    await deal(pNorthBright, org.brightwave!.id, org.northstar!.id, "SEO retainer for KraftHome", "KraftHome Furnishings", "negotiation", 360000);
    await deal(pNorthBright, org.northstar!.id, null, "Joint offer — Spice Route Restaurants", "Spice Route Restaurants", "lead", 190000);
    await deal(pGreenBlue, org.bluepeak!.id, null, "Mysuru modern-trade listing (12 stores)", "Mysuru Retail Group", "qualified", 420000);

    // Activity entries for the timeline.
    await admin.from("activity_logs").insert([
      { organization_id: org.northstar!.id, partnership_id: pNorthBright, actor_id: users.north, action: "document.uploaded", entity_type: "document", summary: "Document uploaded: Joint offer scope" },
      { organization_id: org.brightwave!.id, partnership_id: pNorthBright, actor_id: users.bright, action: "deal.registered", entity_type: "deal", summary: "Deal registered: Café Brew Co. website rebuild" },
      { organization_id: org.northstar!.id, partnership_id: pNorthBright, actor_id: managerId, action: "milestone.completed", entity_type: "milestone", summary: "Milestone completed: Joint offer launched 🎯" },
      { organization_id: org.apex!.id, partnership_id: pGreenApex, actor_id: users.apex, action: "agreement.updated", entity_type: "agreement", summary: "Agreement \"Cold-chain Service Level Agreement\" updated to v2" },
      { organization_id: org.greenleaf!.id, partnership_id: pGreenApex, actor_id: users.green, action: "agreement.approved", entity_type: "agreement", summary: "GreenLeaf Foods approved \"Cold-chain Service Level Agreement\" (v2)" },
    ]);

    // Notifications for the main demo user.
    await admin.from("notifications").insert([
      { user_id: users.north, organization_id: org.northstar!.id, type: "request_received", title: "New partnership request from Horizon Travel Group", body: "Booking approval automation for corporate travel", link: "/dashboard/requests?tab=incoming" },
      { user_id: users.north, organization_id: org.northstar!.id, type: "application_status", title: "Application shortlisted", body: "Seeking web development agencies for white-label projects", link: "/dashboard/applications" },
      { user_id: users.north, organization_id: org.northstar!.id, type: "message", title: "New message from BrightWave Marketing", body: "Perfect. Let's sync Thursday on the webinar milestone.", link: `/dashboard/partnerships/${pNorthBright}/messages` },
    ]);

    // Reports and a contact message for the admin console.
    await admin.from("reports").insert({ reporter_id: users.green, reporter_organization_id: org.greenleaf!.id, target_type: "organization", target_id: org.horizon!.id, reason: "misleading", details: "Demo report: profile claims coverage in regions not listed in their services." });
    await admin.from("contact_messages").insert({ name: "Demo Visitor", email: `visitor@${DOMAIN}`, company: "Example Pvt Ltd", message: "We'd like to discuss an Enterprise plan for our 40-member partnerships team." });

    log("Demo data created.");
  }

  await main();
}

export const DEMO_ACCOUNTS = [
  { role: "Super admin", email: `admin@${DOMAIN}` },
  { role: "Moderator", email: `moderator@${DOMAIN}` },
  { role: "Owner — Northstar (Business plan)", email: `northstar@${DOMAIN}` },
  { role: "Partnership manager — Northstar", email: `manager@${DOMAIN}` },
  { role: "Member — Northstar (1 workspace)", email: `member@${DOMAIN}` },
  { role: "Owner — BrightWave (Growth)", email: `brightwave@${DOMAIN}` },
  { role: "Owner — GreenLeaf (Growth)", email: `greenleaf@${DOMAIN}` },
  { role: "Owner — BluePeak (Free)", email: `bluepeak@${DOMAIN}` },
  ...["apex", "novatech", "urbannest", "horizon"].map((k) => ({ role: `Owner — ${COMPANIES.find((c) => c.key === k)!.name}`, email: `${k}@${DOMAIN}` })),
];
