// One dispatcher for /api/family/*. Pure (no Astro types) so it can be tested end to end; the
// Astro route only translates Request/cookies to and from it. Later modules register here.
import type { FamilyDeps, FamilyResult, Tokens } from "./accounts";
import * as A from "./accounts";
import { SCORE_GAMES } from "../profile/scores";

export interface Req { method: string; path: string[]; body: Record<string, unknown>; tokens: Tokens; childToken?: string; query: Record<string, string>; raw?: string; headers?: Record<string, string> }
export type Route = (r: Req, d: FamilyDeps) => Promise<FamilyResult> | FamilyResult;

const routes: Record<string, Route> = {
  "POST parent/signup": (r, d) => A.signupParent(r.body as never, d),
  "POST parent/login": (r, d) => A.loginParent(r.body as never, d),
  "POST parent/lock": () => A.lockParent(),
  "GET household": (r, d) => A.getHousehold(r.tokens, d),
  "GET picker": (r, d) => A.listPicker(r.tokens, d),
  "POST switch": (r, d) => A.switchProfile(r.tokens, r.body as never, d),
  "POST profiles": (r, d) => A.addProfile(r.tokens, r.body as never, d),
  "POST profiles/claim": (r, d) => A.claimLegacy(r.tokens, r.body as never, d),
};

/** Add routes from another module (called at import time by that module's registrar). */
export function register(extra: Record<string, Route>): void { Object.assign(routes, extra); }

export async function handle(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const key = `${r.method} ${r.path.join("/")}`;
  const exact = routes[key];
  if (exact) return exact(r, d);
  // /profiles/:username[/export]
  if (r.path[0] === "profiles" && r.path.length >= 2) {
    const u = decodeURIComponent(r.path[1]);
    if (r.method === "PATCH" && r.path.length === 2) return A.updateProfile(r.tokens, u, r.body as never, d);
    if (r.method === "GET" && r.path[2] === "export") return A.exportProfile(r.tokens, u, d);
    if (r.method === "DELETE" && r.path.length === 2) return A.deleteProfile(r.tokens, u, SCORE_GAMES, d);
  }
  return { status: 404, json: { error: "not-found" } };
}
