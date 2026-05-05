import { describe, expect, it } from "vitest";

import { isValidAdminBypassToken } from "./adminBypass";

describe("isValidAdminBypassToken", () => {
  it("accepts the configured bypass token", () => {
    expect(isValidAdminBypassToken("dev-token", "dev-token")).toBe(true);
  });

  it("rejects missing, empty, or mismatched tokens", () => {
    expect(isValidAdminBypassToken(null, "dev-token")).toBe(false);
    expect(isValidAdminBypassToken("dev-token", "")).toBe(false);
    expect(isValidAdminBypassToken("wrong-token", "dev-token")).toBe(false);
  });
});
