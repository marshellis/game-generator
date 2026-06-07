// Pick-your-avatar: a fixed, server-validated set of animal emoji + pastel
// backgrounds. Shared by the signup picker (client) and signup/login/me
// validation (server) so the allowlist has exactly one source of truth. User
// input is NEVER stored raw — anything off the list collapses to the default.

export const AVATARS = [
  "🦊", "🐼", "🐯", "🦁", "🐸", "🐵", "🐙", "🦄",
  "🐶", "🐱", "🐧", "🐝", "🦖", "🐢", "🦉", "🐳",
];

export const AVATAR_COLORS = [
  "#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fed7aa",
];

export const DEFAULT_AVATAR = AVATARS[0];
export const DEFAULT_COLOR = AVATAR_COLORS[0];

export function sanitizeAvatar(a: unknown): string {
  return typeof a === "string" && (AVATARS as string[]).includes(a) ? a : DEFAULT_AVATAR;
}

export function sanitizeColor(c: unknown): string {
  return typeof c === "string" && (AVATAR_COLORS as string[]).includes(c) ? c : DEFAULT_COLOR;
}
