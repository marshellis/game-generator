import type { APIRoute } from "astro";

export const prerender = false;

// ICE servers for the arcade's peer-to-peer games (Net Rally). STUN alone only
// connects peers on the same network; a TURN relay is needed across different
// networks / strict NATs. Provide TURN by setting the `NETRALLY_ICE_SERVERS`
// env var to the JSON `iceServers` array from a provider (e.g. metered.ca) —
// kept in env, never in the repo. Without it we fall back to STUN-only.
const STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const GET: APIRoute = async () => {
  let extra: unknown[] = [];
  try {
    const raw = process.env.NETRALLY_ICE_SERVERS;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) extra = parsed;
    }
  } catch {
    // malformed env → just ship STUN; co-op still works on the same network
  }
  return new Response(JSON.stringify({ iceServers: [...STUN, ...extra] }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
};
