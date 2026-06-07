import type { APIRoute } from "astro";
import { logout } from "../../../lib/profile/handlers";
import { applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  const res = logout();
  applyCookie(cookies, res);
  return toResponse(res);
};
