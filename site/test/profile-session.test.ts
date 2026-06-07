import { describe, it, expect } from "vitest";
import { signSession, verifySession, SESSION_MAX_AGE_SEC } from "../src/lib/profile/session";

const SECRET = "test-secret";

describe("session", () => {
  it("round-trips a valid token", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t, SECRET, 1000)).toEqual({ username: "alice" });
  });
  it("rejects a tampered token", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t + "x", SECRET, 1000)).toBeNull();
  });
  it("rejects a token signed with a different secret", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t, "other", 1000)).toBeNull();
  });
  it("rejects an expired token", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t, SECRET, 1000 + SESSION_MAX_AGE_SEC + 1)).toBeNull();
  });
  it("rejects undefined / empty", () => {
    expect(verifySession(undefined, SECRET, 1000)).toBeNull();
    expect(verifySession("", SECRET, 1000)).toBeNull();
  });
});
