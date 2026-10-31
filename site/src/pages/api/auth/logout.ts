import type { APIRoute } from "astro";
import { originAllowed, selfOrigins, forbidden } from "../../../lib/origin";
import { logout } from "../../../lib/profile/handlers";
import { applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!originAllowed(request.method, request.headers.get("origin"), selfOrigins(request, url))) return forbidden();
  const res = logout();
  applyCookie(cookies, res);
  return toResponse(res);
};
