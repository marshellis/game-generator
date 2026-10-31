import { describe, it, expect } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { AVATARS as SERVER_AVATARS } from "../src/lib/profile/avatars";

// The SDK is a plain browser script; run it in a bare context and read the global it defines.
const ctx: any = {};
vm.runInNewContext(fs.readFileSync(new URL("../public/arcade/_sdk/marshellis.js", import.meta.url), "utf8"), ctx);
const sdk = ctx.Marshellis;

describe("arcade SDK", () => {
  it("validates username and PIN like the server", () => {
    expect(sdk._validate("Ab_1", "1234")).toEqual({ u: "ab_1", p: "1234" });
    expect(sdk._validate("a", "1234").error).toMatch(/Username/);
    expect(sdk._validate("abc", "12").error).toMatch(/PIN/);
  });
  it("avatar list matches the server allowlist", () => {
    expect(sdk.AVATARS).toEqual([...SERVER_AVATARS]);
  });
});
