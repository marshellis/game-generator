import type { APIRoute } from "astro";
import { login } from "../../../lib/profile/handlers";
import { deps, readBody, applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const res = await login(await readBody(request), deps());
  applyCookie(cookies, res);
  return toResponse(res);
};
