import { makeRng } from "../../core/rng";
import { pick } from "./util";
import { resolveGrade } from "./grades";
import { assembleActivities } from "./assemble";
import { scorePacket, inBand, distanceToBand } from "./difficulty";
import { slugify, makePuzzleId } from "../logic-grid/serialize";
import type { Activity, Packet } from "./types";

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
  const title = opts.title ?? pick(makeRng(opts.seed), TITLES);

  // Target the grade's difficulty band (framework §3): try deterministically
  // salted compositions and take the first one that lands in band; if none do
  // within the budget, keep the closest. Score is reported on the packet.
  let activities: Activity[] = [];
  let bestDelta = Infinity;
  for (let k = 0; k < 24; k++) {
    const cand = assembleActivities(g, makeRng(opts.seed * 101 + k * 9973));
    const load = scorePacket(cand);
    if (inBand(g.id, load)) { activities = cand; break; }
    const delta = distanceToBand(g.id, load);
    if (delta < bestDelta) { bestDelta = delta; activities = cand; }
  }

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
    load: scorePacket(activities),
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
