import { describe, it, expect } from "vitest";
import {
  normalizeUsername, validateUsername, validatePin, hashPin, verifyPin,
} from "../src/lib/profile/auth";

describe("username", () => {
  it("normalizes case and surrounding space", () => {
    expect(normalizeUsername("  Alice  ")).toBe("alice");
  });
  it("accepts 3-20 of [a-z0-9_-]", () => {
    expect(validateUsername("ace_01")).toBe(true);
    expect(validateUsername("ab")).toBe(false);        // too short
    expect(validateUsername("a".repeat(21))).toBe(false); // too long
    expect(validateUsername("bad name")).toBe(false);  // space
    expect(validateUsername("Bad")).toBe(false);       // uppercase (caller must normalize first)
  });
});

describe("pin", () => {
  it("accepts 4-8 digits only", () => {
    expect(validatePin("1234")).toBe(true);
    expect(validatePin("12345678")).toBe(true);
    expect(validatePin("123")).toBe(false);
    expect(validatePin("123456789")).toBe(false);
    expect(validatePin("12ab")).toBe(false);
  });
});

describe("pin hashing", () => {
  it("verifies the correct pin and rejects a wrong one", () => {
    const stored = hashPin("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPin("4821", stored)).toBe(true);
    expect(verifyPin("0000", stored)).toBe(false);
  });
  it("produces a different salt each call", () => {
    expect(hashPin("4821")).not.toBe(hashPin("4821"));
  });
  it("rejects malformed stored values", () => {
    expect(verifyPin("4821", "garbage")).toBe(false);
  });
});
