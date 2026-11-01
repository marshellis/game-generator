// In-memory implementation of the profile Store: used by the simulation tests AND by the local end-to-end
// server (E2E_MEMORY=1), so both exercise the same storage semantics. Never used in production.
import type { Store, UserRecord, ScoreEntry, CompletionValue } from "./types";

/** Full in-memory implementation of the profile Store (users, completions, lockouts, leaderboards). */
export function memoryStore() {
  const users = new Map<string, UserRecord>();
  const completions = new Map<string, Record<string, unknown>>();
  const lockouts = new Map<string, number>();
  const boards = new Map<string, Map<string, number>>();
  const board = (g: string) => { if (!boards.has(g)) boards.set(g, new Map()); return boards.get(g)!; };
  const sorted = (g: string): [string, number][] => [...board(g)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const store: Store & { users: typeof users; boards: typeof boards } = {
    users, boards,
    async getUser(u) { return structuredClone(users.get(u) ?? null); },
    async createUser(u, rec) { if (users.has(u)) return false; users.set(u, structuredClone(rec)); return true; },
    async getCompletions(u) { return structuredClone(completions.get(u) ?? {}); },
    async putCompletion(u, f, v: CompletionValue) { completions.set(u, { ...(completions.get(u) ?? {}), [f]: v }); },
    async bumpLockout(u) { const n = (lockouts.get(u) ?? 0) + 1; lockouts.set(u, n); return n; },
    async getLockout(u) { return lockouts.get(u) ?? 0; },
    async bumpScore(g, u, s) { const b = board(g); b.set(u, Math.max(b.get(u) ?? -Infinity, s)); return b.get(u)!; },
    async topScores(g, n): Promise<ScoreEntry[]> { return sorted(g).slice(0, n).map(([username, score]) => ({ username, score })); },
    async userBest(g, u) { return board(g).get(u) ?? 0; },
    async userRank(g, u) { const i = sorted(g).findIndex(([m]) => m === u); return i < 0 ? null : i + 1; },
    async playerCount(g) { return board(g).size; },
    async removeScore(g, u) { board(g).delete(u); },
    async deleteUser(u) { users.delete(u); completions.delete(u); lockouts.delete(u); },
  };
  return store;
}

