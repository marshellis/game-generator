import type { APIRoute } from "astro";
import { leaderboard } from "../../lib/profile/handlers";
import { deps, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const res = await leaderboard(
    { game: url.searchParams.get("game") ?? "", limit: url.searchParams.get("limit") ?? undefined },
    deps(),
  );
  return toResponse(res);
};
