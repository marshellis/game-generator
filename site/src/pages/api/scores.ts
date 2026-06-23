import type { APIRoute } from "astro";
import { submitScore } from "../../lib/profile/handlers";
import { deps, readToken, readBody, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readBody(request);
  const res = await submitScore(readToken(cookies), { game: body.game as string, score: body.score }, deps());
  return toResponse(res);
};
