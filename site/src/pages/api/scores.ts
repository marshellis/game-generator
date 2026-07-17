import type { APIRoute } from "astro";
import { submitScore, submitPairScore, deleteScore } from "../../lib/profile/handlers";
import { deps, readToken, readBody, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readBody(request);
  const token = readToken(cookies);
  // A `partner` field routes to the co-op (pair) leaderboard; otherwise it's a solo score.
  const res = body.partner
    ? await submitPairScore(token, { game: body.game as string, score: body.score, partner: body.partner as string }, deps())
    : await submitScore(token, { game: body.game as string, score: body.score }, deps());
  return toResponse(res);
};

// Removes the CALLER's own leaderboard entry (auth required) — the price of
// losing Glass Bridge's wheel of misfortune.
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const body = await readBody(request);
  const res = await deleteScore(readToken(cookies), { game: body.game as string }, deps());
  return toResponse(res);
};
