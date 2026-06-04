import petsRaw from "./themes/pets.json";
import spaceRaw from "./themes/space.json";
import monstersRaw from "./themes/monsters.json";
import piratesRaw from "./themes/pirates.json";
import wizardsRaw from "./themes/wizards.json";
import foodtrucksRaw from "./themes/foodtrucks.json";
import type { Rng } from "../../core/rng";

/** A theme-authoring category. `subject` marks the "people" category whose items are
 *  named directly in clues; `comparative` gives an ordered category its natural relation
 *  (e.g. "older than") so comparative clues read naturally. Neither field is emitted into
 *  the published puzzle — they only steer phrasing. */
export interface ThemeCategory {
  name: string;
  ordered?: boolean;
  subject?: boolean;
  comparative?: string;
  items: string[];
}

export interface ThemePack {
  title: string;
  blurb: string;
  categories: ThemeCategory[];
}

export function loadThemePacks(): ThemePack[] {
  return [
    petsRaw as ThemePack,
    spaceRaw as ThemePack,
    monstersRaw as ThemePack,
    piratesRaw as ThemePack,
    wizardsRaw as ThemePack,
    foodtrucksRaw as ThemePack,
  ];
}

/** Pick a theme that can supply the requested size. With an `rng`, choose randomly
 *  among the usable themes (so the puzzle set spans worlds); without one, the first. */
export function pickTheme(
  packs: ThemePack[],
  categories: number,
  items: number,
  needOrdered: boolean,
  rng?: Rng,
): ThemePack {
  const usable = packs.filter((p) => {
    const enoughCats = p.categories.length >= categories;
    const enoughItems = p.categories.every((c) => c.items.length >= items);
    const hasOrdered = !needOrdered || p.categories.some((c) => c.ordered && c.items.length >= items);
    return enoughCats && enoughItems && hasOrdered;
  });
  if (usable.length === 0) throw new Error(`no theme pack supports ${categories}x${items} (ordered=${needOrdered})`);
  if (!rng) return usable[0]!;
  return usable[Math.floor(rng() * usable.length)]!;
}

/** Reduce a theme to exactly `categories` categories of `items` items each.
 *  Always keeps the subject category (so clues have a "who"); keeps an ordered
 *  category when comparatives are needed. */
export function sliceTheme(theme: ThemePack, categories: number, items: number, needOrdered: boolean): ThemePack {
  const subject = theme.categories.filter((c) => c.subject);
  const ordered = theme.categories.filter((c) => c.ordered && !c.subject);
  const rest = theme.categories.filter((c) => !c.ordered && !c.subject);

  const chosen: ThemeCategory[] = [];
  if (subject[0]) chosen.push(subject[0]);
  if (needOrdered && ordered[0]) chosen.push(ordered[0]);
  for (const c of rest) {
    if (chosen.length >= categories) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  for (const c of ordered) {
    if (chosen.length >= categories) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  for (const c of subject) {
    if (chosen.length >= categories) break;
    if (!chosen.includes(c)) chosen.push(c);
  }

  const sliced = chosen.slice(0, categories).map((c) => ({
    name: c.name,
    ordered: c.ordered,
    subject: c.subject,
    comparative: c.comparative,
    items: c.items.slice(0, items),
  }));
  return { title: theme.title, blurb: theme.blurb, categories: sliced };
}
