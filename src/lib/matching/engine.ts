/**
 * Transparent rule-based partner matching.
 *
 * Every point in the score comes from an explicit rule below — there is no
 * opaque model. Weights are configurable by platform admins
 * (platform_settings.matching_weights) and normalised to a 0–100 scale.
 */

export interface MatchWeights {
  industry: number;
  complementary_services: number;
  partnership_type: number;
  objectives: number;
  geography: number;
  company_size: number;
  target_market: number;
  capabilities: number;
}

export const DEFAULT_WEIGHTS: MatchWeights = {
  industry: 15,
  complementary_services: 20,
  partnership_type: 25,
  objectives: 10,
  geography: 10,
  company_size: 5,
  target_market: 10,
  capabilities: 5,
};

export interface MatchProfile {
  id: string;
  name: string;
  industrySlug: string | null;
  parentIndustrySlug: string | null;
  subIndustrySlug: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  companySize: string | null;
  capabilities: string[];
  targetMarkets: string[];
  locationsServed: string[];
  goals: string[];
  offered: string[]; // category slugs
  wanted: string[]; // category slugs
  serviceText: string; // services + products + description, lowercased
}

export interface MatchResult {
  organizationId: string;
  score: number;
  breakdown: Record<keyof MatchWeights, number>;
  reasons: string[];
  matchingTypes: string[];
  sharedInterests: string[];
  suggestedCollaborations: string[];
}

/**
 * Industry pairs that commonly complement each other (sub-industry or industry slugs).
 * Directional pairs are treated symmetrically.
 */
const COMPLEMENTARY: [string, string, string][] = [
  ["web-app-development", "digital-marketing", "Bundle website builds with digital marketing retainers"],
  ["web-app-development", "branding-creative", "Offer end-to-end brand + website packages"],
  ["information-technology", "marketing-advertising", "Co-deliver technology and growth marketing to shared clients"],
  ["saas", "it-services-consulting", "Implementation and reseller partnership for the software"],
  ["food-beverage", "wholesale-distribution", "Distribute products through an established wholesale network"],
  ["packaged-foods", "fmcg-distribution", "Regional FMCG distribution of packaged food lines"],
  ["food-beverage", "logistics-supply-chain", "Cold-chain and last-mile logistics for food products"],
  ["manufacturing", "wholesale-distribution", "Channel distribution for manufactured goods"],
  ["manufacturing", "logistics-supply-chain", "Inbound/outbound supply-chain partnership"],
  ["wholesale-distribution", "logistics-supply-chain", "Shared warehousing and transport capacity"],
  ["retail-ecommerce", "logistics-supply-chain", "Fulfilment and delivery for online orders"],
  ["retail-ecommerce", "marketing-advertising", "Performance marketing for D2C growth"],
  ["travel-hospitality", "marketing-advertising", "Destination and travel co-marketing campaigns"],
  ["travel-hospitality", "information-technology", "Booking platform and travel-tech integrations"],
  ["interior-design-architecture", "real-estate-construction", "Interior fit-outs for real-estate projects"],
  ["interior-design-architecture", "manufacturing", "Custom furniture and fixture manufacturing"],
  ["interior-design-architecture", "travel-hospitality", "Hospitality interior design and refurbishments"],
  ["information-technology", "logistics-supply-chain", "Logistics tracking and automation software"],
  ["information-technology", "healthcare-life-sciences", "Digital health solutions"],
  ["financial-services", "retail-ecommerce", "Embedded payments and financing for merchants"],
];

/** Category pairs where one side's offer meets the other's need even if slugs differ. */
const RECIPROCAL_TYPES: Record<string, string[]> = {
  distributor: ["distributor", "reseller", "supply-chain"],
  reseller: ["reseller", "distributor", "white-label"],
  referral: ["referral", "affiliate"],
  affiliate: ["affiliate", "referral"],
  technology: ["technology", "integration"],
  integration: ["integration", "technology"],
  marketing: ["marketing"],
  "strategic-alliance": ["strategic-alliance", "joint-venture"],
  manufacturing: ["manufacturing", "white-label", "supply-chain"],
  "supply-chain": ["supply-chain", "manufacturing", "distributor"],
  "joint-venture": ["joint-venture", "strategic-alliance"],
  "white-label": ["white-label", "manufacturing", "reseller"],
  franchise: ["franchise"],
  other: ["other"],
};

const SIZE_ORDER = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

const norm = (s: string) => s.trim().toLowerCase();
const overlap = (a: string[], b: string[]) => {
  const set = new Set(b.map(norm));
  return Array.from(new Set(a.map(norm))).filter((x) => set.has(x));
};
const titleize = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function industryKeys(p: MatchProfile) {
  return [p.industrySlug, p.subIndustrySlug, p.parentIndustrySlug].filter(Boolean) as string[];
}

function complementarity(a: MatchProfile, b: MatchProfile) {
  const ak = industryKeys(a);
  const bk = industryKeys(b);
  for (const [x, y, idea] of COMPLEMENTARY) {
    if ((ak.includes(x) && bk.includes(y)) || (ak.includes(y) && bk.includes(x))) return idea;
  }
  return null;
}

export function normaliseWeights(w: Partial<MatchWeights>): MatchWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...w };
  const total = Object.values(merged).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0) || 1;
  const out = {} as MatchWeights;
  for (const k of Object.keys(merged) as (keyof MatchWeights)[]) out[k] = (Math.max(0, Number(merged[k]) || 0) / total) * 100;
  return out;
}

export function scoreMatch(me: MatchProfile, other: MatchProfile, weightsInput: Partial<MatchWeights> = {}): MatchResult {
  const w = normaliseWeights(weightsInput);
  const breakdown = Object.fromEntries(Object.keys(w).map((k) => [k, 0])) as Record<keyof MatchWeights, number>;
  const reasons: string[] = [];
  const shared: string[] = [];
  const ideas: string[] = [];

  // 1. Partnership type — what I want vs. what they offer (and vice versa).
  const theyOfferWhatIWant = me.wanted.filter((cat) => other.offered.some((o) => (RECIPROCAL_TYPES[cat] ?? [cat]).includes(o)));
  const iOfferWhatTheyWant = other.wanted.filter((cat) => me.offered.some((o) => (RECIPROCAL_TYPES[cat] ?? [cat]).includes(o)));
  const matchingTypes = Array.from(new Set([...theyOfferWhatIWant, ...iOfferWhatTheyWant]));
  if (matchingTypes.length) {
    const directional = (theyOfferWhatIWant.length ? 0.6 : 0) + (iOfferWhatTheyWant.length ? 0.4 : 0);
    breakdown.partnership_type = w.partnership_type * Math.min(1, directional + 0.1 * (matchingTypes.length - 1));
    if (theyOfferWhatIWant.length) reasons.push(`Offers ${theyOfferWhatIWant.map(titleize).join(", ")} partnerships you are looking for`);
    if (iOfferWhatTheyWant.length) reasons.push(`Is looking for ${iOfferWhatTheyWant.map(titleize).join(", ")} partners like you`);
  }

  // 2. Complementary services (cross-industry fit) — higher value than same-industry.
  const idea = complementarity(me, other);
  if (idea) {
    breakdown.complementary_services = w.complementary_services;
    reasons.push("Complementary services to yours");
    ideas.push(idea);
  } else {
    // Keyword complementarity: their services mention what I want to buy/sell.
    const myCaps = me.capabilities.map(norm);
    const theirText = other.serviceText;
    const mentions = myCaps.filter((c) => c.length > 3 && theirText.includes(c)).length;
    if (mentions) breakdown.complementary_services = w.complementary_services * Math.min(0.6, mentions * 0.2);
  }

  // 3. Industry: same sub-industry → full; same parent → half (useful for alliances / referrals).
  if (me.subIndustrySlug && me.subIndustrySlug === other.subIndustrySlug) {
    breakdown.industry = w.industry;
    reasons.push("Same specialisation — strong fit for referrals and alliances");
  } else if (me.parentIndustrySlug && me.parentIndustrySlug === other.parentIndustrySlug) {
    breakdown.industry = w.industry * 0.5;
    reasons.push("Operates in the same industry");
  } else if (idea) {
    breakdown.industry = w.industry * 0.3;
  }

  // 4. Objectives overlap.
  const sharedGoals = overlap(me.goals, other.goals);
  if (sharedGoals.length) {
    breakdown.objectives = w.objectives * Math.min(1, sharedGoals.length / 3);
    shared.push(...sharedGoals.map(titleize));
  }

  // 5. Geography.
  const myAreas = [me.city, me.state, me.country, ...me.locationsServed].filter(Boolean) as string[];
  const theirAreas = [other.city, other.state, other.country, ...other.locationsServed].filter(Boolean) as string[];
  if (me.city && other.city && norm(me.city) === norm(other.city)) {
    breakdown.geography = w.geography;
    reasons.push(`Also based in ${other.city}`);
  } else if (me.state && other.state && norm(me.state) === norm(other.state)) {
    breakdown.geography = w.geography * 0.8;
    reasons.push(`Operates in ${other.state}`);
  } else if (overlap(myAreas, theirAreas).length) {
    breakdown.geography = w.geography * 0.6;
    reasons.push("Serves overlapping locations");
  } else if (me.country && other.country && norm(me.country) === norm(other.country)) {
    breakdown.geography = w.geography * 0.4;
  }

  // 6. Company size compatibility (adjacent sizes score best).
  if (me.companySize && other.companySize) {
    const d = Math.abs(SIZE_ORDER.indexOf(me.companySize) - SIZE_ORDER.indexOf(other.companySize));
    breakdown.company_size = w.company_size * Math.max(0, 1 - d * 0.3);
  }

  // 7. Target market overlap (shared customers → co-selling).
  const markets = overlap(me.targetMarkets, other.targetMarkets);
  if (markets.length) {
    breakdown.target_market = w.target_market * Math.min(1, markets.length / 2);
    reasons.push(`Targets the same customers: ${markets.slice(0, 3).map(titleize).join(", ")}`);
    shared.push(...markets.map(titleize));
  }

  // 8. Capability overlap.
  const caps = overlap(me.capabilities, other.capabilities);
  if (caps.length) {
    breakdown.capabilities = w.capabilities * Math.min(1, caps.length / 3);
    shared.push(...caps.map(titleize));
  }

  // Suggested collaborations from matching types.
  for (const t of matchingTypes.slice(0, 2)) {
    const map: Record<string, string> = {
      distributor: `Appoint ${other.name} as a regional distributor`,
      reseller: `Set up a reseller agreement with ${other.name}`,
      referral: "Exchange qualified referrals with a referral fee",
      affiliate: "Launch an affiliate programme with tracked commissions",
      technology: "Co-build a joint technology offering",
      integration: "Build a product integration for shared customers",
      marketing: "Run a co-marketing campaign or joint webinar",
      "strategic-alliance": "Form a strategic alliance for joint go-to-market",
      manufacturing: "Explore contract or private-label manufacturing",
      "supply-chain": "Streamline sourcing and logistics together",
      "joint-venture": "Evaluate a joint venture for a new market",
      "white-label": "White-label their offering under your brand",
      franchise: "Discuss franchise expansion opportunities",
    };
    if (map[t]) ideas.push(map[t]);
  }

  const score = Math.round(Object.values(breakdown).reduce((s, v) => s + v, 0));
  for (const k of Object.keys(breakdown) as (keyof MatchWeights)[]) breakdown[k] = Math.round(breakdown[k] * 10) / 10;

  return {
    organizationId: other.id,
    score: Math.min(100, score),
    breakdown,
    reasons: reasons.slice(0, 5),
    matchingTypes: matchingTypes.map(titleize),
    sharedInterests: Array.from(new Set(shared)).slice(0, 6),
    suggestedCollaborations: Array.from(new Set(ideas)).slice(0, 3),
  };
}

export function rankMatches(me: MatchProfile, candidates: MatchProfile[], weights: Partial<MatchWeights>, minScore = 15) {
  return candidates
    .filter((c) => c.id !== me.id)
    .map((c) => scoreMatch(me, c, weights))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
