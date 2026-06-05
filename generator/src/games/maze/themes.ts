import mouse from "./themes/mouse.json";
import space from "./themes/space.json";
import bee from "./themes/bee.json";
import dog from "./themes/dog.json";
import type { Rng } from "../../core/rng";

export interface ThemePack {
  title: string;
  blurb: string;
  startIcon: string;
  endIcon: string;
}

export function loadThemes(): ThemePack[] {
  return [mouse as ThemePack, space as ThemePack, bee as ThemePack, dog as ThemePack];
}

export function pickTheme(themes: ThemePack[], rng: Rng): ThemePack {
  return themes[Math.floor(rng() * themes.length)]!;
}
