import { describe, expect, it } from "vitest";

import { getPrimaryEmailFromClerkUser } from "./clerkUserEmail";

describe("getPrimaryEmailFromClerkUser", () => {
  it("uses the primary email address when available", () => {
    expect(
      getPrimaryEmailFromClerkUser({
        primaryEmailAddressId: "email_1",
        emailAddresses: [
          { id: "email_2", emailAddress: "secondary@example.com" },
          { id: "email_1", emailAddress: "manager@terminalauto.ca" },
        ],
      }),
    ).toBe("manager@terminalauto.ca");
  });

  it("falls back to the first email address", () => {
    expect(
      getPrimaryEmailFromClerkUser({
        primaryEmailAddressId: null,
        emailAddresses: [{ id: "email_1", emailAddress: "lead@valleycollision.ca" }],
      }),
    ).toBe("lead@valleycollision.ca");
  });

  it("returns an empty string when no email address exists", () => {
    expect(getPrimaryEmailFromClerkUser({ primaryEmailAddressId: null, emailAddresses: [] })).toBe("");
  });
});
