import { describe, expect, it } from "vitest";
import { normaliseWeights, rankMatches, scoreMatch, type MatchProfile } from "@/lib/matching/engine";

const base = (o: Partial<MatchProfile>): MatchProfile => ({
  id: "x",
  name: "X",
  industrySlug: null,
  parentIndustrySlug: null,
  subIndustrySlug: null,
  country: "India",
  state: null,
  city: null,
  companySize: null,
  capabilities: [],
  targetMarkets: [],
  locationsServed: [],
  goals: [],
  offered: [],
  wanted: [],
  serviceText: "",
  ...o,
});

const webDev = base({
  id: "web",
  name: "Northstar",
  industrySlug: "web-app-development",
  parentIndustrySlug: "information-technology",
  subIndustrySlug: "web-app-development",
  city: "Bengaluru",
  state: "Karnataka",
  companySize: "51-200",
  wanted: ["marketing", "referral"],
  offered: ["technology", "referral"],
  targetMarkets: ["SMBs", "Retail"],
  goals: ["collaborate-on-marketing", "find-new-customers"],
});

const marketing = base({
  id: "mkt",
  name: "BrightWave",
  industrySlug: "digital-marketing",
  parentIndustrySlug: "marketing-advertising",
  subIndustrySlug: "digital-marketing",
  city: "Bengaluru",
  state: "Karnataka",
  companySize: "11-50",
  offered: ["marketing", "referral"],
  wanted: ["technology"],
  targetMarkets: ["SMBs", "D2C"],
  goals: ["collaborate-on-marketing"],
});

const unrelated = base({ id: "far", name: "Faraway", industrySlug: "agriculture", parentIndustrySlug: "agriculture", country: "Kenya", offered: ["franchise"], wanted: ["franchise"] });

describe("matching engine", () => {
  it("normalises weights to 100", () => {
    const w = normaliseWeights({ industry: 50, partnership_type: 50, complementary_services: 0, objectives: 0, geography: 0, company_size: 0, target_market: 0, capabilities: 0 });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("recommends a complementary marketing agency to a web development company", () => {
    const r = scoreMatch(webDev, marketing);
    expect(r.score).toBeGreaterThan(60);
    expect(r.reasons.join(" ")).toMatch(/Complementary services/);
    expect(r.matchingTypes).toContain("Marketing");
    expect(r.suggestedCollaborations.length).toBeGreaterThan(0);
  });

  it("score equals the sum of its breakdown (transparent)", () => {
    const r = scoreMatch(webDev, marketing);
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - r.score)).toBeLessThanOrEqual(1);
  });

  it("ranks relevant companies above unrelated ones and filters weak matches", () => {
    const ranked = rankMatches(webDev, [unrelated, marketing], {});
    expect(ranked[0]!.organizationId).toBe("mkt");
    expect(ranked.find((r) => r.organizationId === "far")).toBeUndefined();
  });

  it("never recommends a company to itself", () => {
    expect(rankMatches(webDev, [webDev], {}).length).toBe(0);
  });
});
