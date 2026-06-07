import type { APIRoute } from "astro";
import { me } from "../../lib/profile/handlers";
import { deps, readToken, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  return toResponse(me(readToken(cookies), deps()));
};
