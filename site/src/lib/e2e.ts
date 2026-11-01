/**
 * Local end-to-end mode: `E2E_MEMORY=1` swaps Redis for in-memory storage and drops the Secure cookie flag so a
 * browser test can run the REAL site on http://localhost with no external services. It can never activate on Vercel
 * (VERCEL is set there) so a stray env var cannot disable production storage.
 */
export const e2eMemory = (): boolean => process.env.E2E_MEMORY === "1" && !process.env.VERCEL;
export const cookieSecure = (): boolean => !e2eMemory();
