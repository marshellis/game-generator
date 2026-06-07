import { describe, it, expect } from "vitest";
import {
  AVATARS, AVATAR_COLORS, DEFAULT_AVATAR, DEFAULT_COLOR,
  sanitizeAvatar, sanitizeColor,
} from "../src/lib/profile/avatars";

describe("avatar allowlists", () => {
  it("expose non-empty option lists with sane defaults that are members", () => {
    expect(AVATARS.length).toBeGreaterThan(5);
    expect(AVATAR_COLORS.length).toBeGreaterThan(2);
    expect(AVATARS).toContain(DEFAULT_AVATAR);
    expect(AVATAR_COLORS).toContain(DEFAULT_COLOR);
  });
});

describe("sanitizeAvatar", () => {
  it("passes through an allowlisted emoji", () => {
    expect(sanitizeAvatar(AVATARS[2])).toBe(AVATARS[2]);
  });
  it("falls back to the default for anything not allowlisted", () => {
    expect(sanitizeAvatar("🦠")).toBe(DEFAULT_AVATAR);     // emoji not in the set
    expect(sanitizeAvatar("<script>")).toBe(DEFAULT_AVATAR); // injection attempt
    expect(sanitizeAvatar(undefined)).toBe(DEFAULT_AVATAR);
    expect(sanitizeAvatar(123)).toBe(DEFAULT_AVATAR);
  });
});

describe("sanitizeColor", () => {
  it("passes through an allowlisted color", () => {
    expect(sanitizeColor(AVATAR_COLORS[1])).toBe(AVATAR_COLORS[1]);
  });
  it("falls back to the default for anything not allowlisted", () => {
    expect(sanitizeColor("#000000")).toBe(DEFAULT_COLOR);
    expect(sanitizeColor("red")).toBe(DEFAULT_COLOR);
    expect(sanitizeColor(undefined)).toBe(DEFAULT_COLOR);
  });
});
