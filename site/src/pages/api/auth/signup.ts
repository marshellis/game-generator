import type { APIRoute } from "astro";
import { originAllowed, selfOrigins, forbidden } from "../../../lib/origin";
import { signup } from "../../../lib/profile/handlers";
import { deps, readBody, applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!originAllowed(request.method, request.headers.get("origin"), selfOrigins(request, url))) return forbidden();
  const res = await signup(await readBody(request), deps());
  applyCookie(cookies, res);
  return toResponse(res);
};
