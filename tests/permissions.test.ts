import { describe, expect, it } from "vitest";
import { assignableRoles, roleHasPermission } from "@/lib/auth/permissions";
import { isUnlimited, limitValue, withinLimit } from "@/lib/billing/limits";
import { safeRedirectPath, splitList } from "@/lib/utils";

describe("role permissions (mirror of SQL role_has_permission)", () => {
  it("owner has everything", () => {
    expect(roleHasPermission("owner", [], "org.delete")).toBe(true);
    expect(roleHasPermission("owner", [], "ownership.transfer")).toBe(true);
  });
  it("admin cannot transfer ownership or delete", () => {
    expect(roleHasPermission("admin", [], "team.manage")).toBe(true);
    expect(roleHasPermission("admin", [], "ownership.transfer")).toBe(false);
    expect(roleHasPermission("admin", [], "org.delete")).toBe(false);
  });
  it("partnership manager handles requests and workspaces but not billing or team", () => {
    expect(roleHasPermission("partnership_manager", [], "requests.manage")).toBe(true);
    expect(roleHasPermission("partnership_manager", [], "workspaces.all")).toBe(true);
    expect(roleHasPermission("partnership_manager", [], "billing.manage")).toBe(false);
    expect(roleHasPermission("partnership_manager", [], "team.manage")).toBe(false);
  });
  it("member only has explicitly granted permissions", () => {
    expect(roleHasPermission("member", [], "requests.manage")).toBe(false);
    expect(roleHasPermission("member", ["requests.manage"], "requests.manage")).toBe(true);
    expect(roleHasPermission(null, ["requests.manage"], "requests.manage")).toBe(false);
  });
  it("only owners can assign the admin role", () => {
    expect(assignableRoles("owner")).toContain("admin");
    expect(assignableRoles("admin")).not.toContain("admin");
    expect(assignableRoles("member")).toEqual([]);
  });
});

describe("plan limits", () => {
  it("treats -1 as unlimited", () => {
    expect(isUnlimited(-1)).toBe(true);
    expect(withinLimit(10_000, -1)).toBe(true);
  });
  it("enforces numeric limits", () => {
    expect(withinLimit(4, 5)).toBe(true);
    expect(withinLimit(5, 5)).toBe(false);
  });
  it("falls back to free-plan defaults", () => {
    expect(limitValue({}, "partnership_requests_per_month")).toBe(5);
    expect(limitValue({ exports: 1 }, "exports")).toBe(1);
  });
});

describe("utils", () => {
  it("blocks open redirects", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/dashboard/requests")).toBe("/dashboard/requests");
  });
  it("splits and dedupes lists", () => {
    expect(splitList("a, b,\na, ,c")).toEqual(["a", "b", "c"]);
  });
});
