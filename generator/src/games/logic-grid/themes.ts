import petsRaw from "./themes/pets.json";
import spaceRaw from "./themes/space.json";
import type { Category } from "./types";

export interface ThemePack {
  title: string;
  blurb: string;
  categories: Category[];
}

export function loadThemePacks(): ThemePack[] {
  return [petsRaw as ThemePack, spaceRaw as ThemePack];
}

export function pickTheme(packs: ThemePack[], categories: number, items: number, needOrdered: boolean): ThemePack {
  const usable = packs.filter((p) => {
    const enoughCats = p.categories.length >= categories;
    const enoughItems = p.categories.every((c) => c.items.length >= items);
    const hasOrdered = !needOrdered || p.categories.some((c) => c.ordered && c.items.length >= items);
    return enoughCats && enoughItems && hasOrdered;
  });
  if (usable.length === 0) throw new Error(`no theme pack supports ${categories}x${items} (ordered=${needOrdered})`);
  return usable[0]!;
}

/** Reduce a theme to exactly `categories` categories of `items` items each. */
export function sliceTheme(theme: ThemePack, categories: number, items: number, needOrdered: boolean): ThemePack {
  const ordered = theme.categories.filter((c) => c.ordered);
  const unordered = theme.categories.filter((c) => !c.ordered);
  const chosen: Category[] = [];
  if (needOrdered && ordered[0]) chosen.push(ordered[0]);
  for (const c of unordered) {
    if (chosen.length >= categories) break;
    chosen.push(c);
  }
  for (const c of ordered) {
    if (chosen.length >= categories) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  const sliced = chosen.slice(0, categories).map((c) => ({
    name: c.name,
    ordered: c.ordered,
    items: c.items.slice(0, items),
  }));
  return { title: theme.title, blurb: theme.blurb, categories: sliced };
}
