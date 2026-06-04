import type { Rng } from "../../core/rng";

/** Inclusive integer in [lo, hi]. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** k distinct integers from [lo, hi]. Throws if the range is too small. */
export function distinctInts(rng: Rng, lo: number, hi: number, k: number): number[] {
  if (hi - lo + 1 < k) throw new Error(`distinctInts: range [${lo},${hi}] too small for ${k}`);
  const seen = new Set<number>();
  while (seen.size < k) seen.add(randInt(rng, lo, hi));
  return [...seen];
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
