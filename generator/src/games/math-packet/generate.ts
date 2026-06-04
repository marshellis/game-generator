import { makeRng } from "../../core/rng";
import { pick } from "./util";
import { resolveGrade } from "./grades";
import { assembleActivities } from "./assemble";
import { slugify, makePuzzleId } from "../logic-grid/serialize";
import type { Packet } from "./types";

export interface GeneratePacketOptions {
  difficulty: string; // "g1".."g8"
  seed: number;
  date: string; // ISO "2026-06-04"
  title?: string;
}

const TITLES = [
  "Number Workout",
  "Brain Warm-Up",
  "Math Mix",
  "Puzzle Power",
  "Mind Stretch",
  "Number Quest",
  "Math Sprint",
  "Puzzle Lab",
];

export function generatePacket(opts: GeneratePacketOptions): Packet {
  const g = resolveGrade(opts.difficulty);
  const rng = makeRng(opts.seed);
  const activities = assembleActivities(g, rng);
  const title = opts.title ?? pick(rng, TITLES);
  const gradeLabel = `Grade ${g.grade}`;
  const slug = slugify(`${title}-${g.id}`);
  return {
    id: makePuzzleId(opts.date, slug, opts.seed),
    title,
    blurb: `A ${activities.length}-puzzle mix for ${gradeLabel}.`,
    gameType: "math-packet",
    gradeLabel,
    difficulty: g.id,
    activities,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
