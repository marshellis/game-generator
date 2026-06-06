export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function makeMazeId(dateIso: string, slug: string, seed: number): string {
  return `${dateIso}-${slug}-${seed}`;
}
