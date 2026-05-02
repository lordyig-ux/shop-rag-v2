import { describe, expect, it } from "vitest";

import { assertImportSecret } from "./importSecret";

describe("assertImportSecret", () => {
  it("allows imports when no secret is configured", () => {
    expect(() => assertImportSecret(undefined, undefined)).not.toThrow();
  });

  it("rejects imports when the configured secret is missing", () => {
    expect(() => assertImportSecret(undefined, "secret-value")).toThrow("Unauthorized import");
  });

  it("rejects imports when the provided secret does not match", () => {
    expect(() => assertImportSecret("wrong", "secret-value")).toThrow("Unauthorized import");
  });

  it("allows imports when the provided secret matches", () => {
    expect(() => assertImportSecret("secret-value", "secret-value")).not.toThrow();
  });
});
