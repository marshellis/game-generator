import type { APIRoute } from "astro";
import { originAllowed, selfOrigins, forbidden } from "../../lib/origin";
import { recordCompletion } from "../../lib/profile/handlers";
import { deps, readToken, readBody, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!originAllowed(request.method, request.headers.get("origin"), selfOrigins(request, url))) return forbidden();
  const body = await readBody(request);
  const res = await recordCompletion(
    readToken(cookies),
    { game: body.game as string, puzzleId: body.puzzleId as string, grade: body.grade as string },
    deps(),
  );
  return toResponse(res);
};
