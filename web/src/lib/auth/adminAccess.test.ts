import { describe, expect, it } from "vitest";

import { isAllowedAdminEmail } from "./adminAccess";

describe("isAllowedAdminEmail", () => {
  it("allows Terminal Auto Body email addresses", () => {
    expect(isAllowedAdminEmail("manager@terminalauto.ca")).toBe(true);
  });

  it("allows Valley Collision email addresses", () => {
    expect(isAllowedAdminEmail("lead@valleycollision.ca")).toBe(true);
  });

  it("normalizes casing and surrounding whitespace", () => {
    expect(isAllowedAdminEmail("  Manager@TerminalAuto.ca  ")).toBe(true);
  });

  it("rejects unknown domains and invalid email strings", () => {
    expect(isAllowedAdminEmail("person@example.com")).toBe(false);
    expect(isAllowedAdminEmail("not-an-email")).toBe(false);
    expect(isAllowedAdminEmail("")).toBe(false);
  });
});
