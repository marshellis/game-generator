# Grade-Appropriateness Framework

**Status:** v1 — developmental backbone is research-verified; education-standards and
reading-level specifics are flagged as *unverified, re-check before relying*.
**Scope:** platform-wide. Every game (logic grid, math packets, future games) calibrates
its difficulty against this document. Game-specific knobs are derived in the
"Applications" section, not invented per game.

The goal: replace eyeballed difficulty ("this feels like 4th grade") with a small set of
research-grounded principles and a **measurable difficulty score** per game.

---

## 1. What the evidence says (verified)

These come from peer-reviewed developmental psychology and survived adversarial
fact-checking. Citations at the bottom.

### P1 — Option count (grid size) is the dominant difficulty lever, and it scales super-linearly
The number of pairwise relationships a solver must hold and infer grows combinatorially
with items per category: **C(n,2) pairs → 3 items = 3, 4 = 6, 5 = 10, 6 = 15**. Going from
3→5 items roughly **doubles memory load and ~6×'s inferential load** (Learning & Behavior
2020). Practical rule: **items-per-category is the primary knob; grow it one step at a time
across grades.** Adding a *category* is also expensive (it multiplies cross-references) —
treat category count as a secondary, slow knob.

### P2 — Inference types have a stable developmental difficulty order
From the conditional-reasoning literature (Frontiers in Psychology 2020), accuracy order
for elementary students is fixed:
**Modus Ponens (easy) < Modus Tollens < Affirmation-of-Consequent / Denial-of-Antecedent (hard).**
Generalizing to the operations our clues require, easiest → hardest:

1. **Direct positive** ("A's pet is the Cat") — assertion; reliable from the earliest grades.
2. **Negation / elimination** ("A's pet is not the Cat") — needs "rule it out"; still early, *if* the X/O grid scaffolds it (see P4).
3. **Disjunction / either-or** ("A's pet is the Cat or the Dog") — hold two open possibilities; mid-elementary.
4. **Transitive / comparative** ("A is older than B") — chain an ordering; an age-graded skill that strengthens through childhood (P3).
5. **Conditional (if-then)** — if ever added: gate Modus-Ponens forms to ~grade 6, defer AC/DA (indefinite) forms further.

### P3 — Reasoning skills are dials, not switches
Conditional reasoning rises **monotonically** across grades 2→4→6 (49% → 59% → 67% correct;
Frontiers 2020), and transitive inference **improves with age across childhood**
(Learning & Behavior 2020). So a clue type isn't simply "unlocked" at one grade — once
introduced, its *frequency and the depth of chaining it requires* should scale up grade by
grade.

### P4 — Young solvers need alternatives made visible, not willpower
For the youngest children, logical-inference success is driven by the **capacity to generate
the remaining possibilities**, not by inhibiting wrong answers (Memory & Cognition 2016).
Design implication: the **X/O elimination grid is itself the scaffold** — it externalizes
"what's still open." Keep it prominent; for low grades consider helper affordances (auto-X
the rest of a row/column when an O is placed). This is why even negation/elimination is
usable early *with the grid*.

### P5 — Keep puzzles pure-deduction (no guessing) at every grade
A well-formed logic puzzle has exactly one solution reachable by deduction with no guessing
(established in the prior layout/uniqueness research). Difficulty should come from
*more/deeper inference*, never from "try a branch and backtrack." Our generator already
guarantees unique + no-guess; keep that invariant across all grades.

---

## 2. Per-grade bands

Cognitive snapshot blends Piaget's concrete→formal-operational arc with the graded findings
above (treat ages as approximate; skills are dials). Reading level is the *commonly cited*
Lexile midpoint — **UNVERIFIED in our research pass; re-source before shipping reading-level
gates.**

| Grade | Age | Cognitive snapshot | Reasoning reliably available | Reading level (unverified) |
|---|---|---|---|---|
| 1 | 6–7 | Early concrete; needs visual scaffolds | Direct positive; simple elimination with the grid | ~100–300L |
| 2 | 7–8 | Concrete; basic if-then (MP/MT) emerging | + negation/elimination held confidently | ~300–500L |
| 3 | 8–9 | Concrete, more fluent | + light multi-step chaining | ~500–700L |
| 4 | 9–10 | Concrete, strengthening | + **disjunction (either-or)**; short transitive chains begin | ~700–850L |
| 5 | 10–11 | Concrete→transitional | + **comparative/transitive** as a regular tool | ~800–950L |
| 6 | 11–12 | Transitional→early formal | + deeper chaining; conditional reasoning near reliable | ~900–1025L |
| 7 | 12–13 | Early formal | + multi-constraint deduction; longer chains | ~970–1100L |
| 8 | 13–14 | Formal operational | + abstract/under-determined steps; minimal clue sets | ~1010–1140L |

---

## 3. Difficulty as a measurable score (the calibration mechanism)

Don't ship a grade label off grid size alone. Compute a **difficulty score** per generated
puzzle from a **simulated tiered solver** that mimics how a kid actually solves, applying
rules in order of human difficulty and recording what it needed:

- **T1** place direct positives → eliminate rest of row/column
- **T2** "only one option left in a row/column ⇒ place it" (elimination)
- **T3** cross-category transitivity (A=B and B≠C ⇒ A≠C)
- **T4** disjunction (either-or) and comparative/transitive ordering
- **T5** longer chained / multi-constraint steps

Report two numbers per puzzle: **(a) highest tier required** and **(b) number of deductive
steps** to full solution. Difficulty score ≈ `structural load + tier weight + step depth`,
where structural load = Σ over category-pairs of C(items,2). Each grade targets a **score
band**; the generator regenerates (or adjusts clue count / redundancy) until the puzzle lands
in band. This makes "is this 4th-grade-appropriate?" a number, and is reusable: every game
defines its own tiers but reports the same (max-tier, step-count, score) shape.

> Why this matters here: the 4th-grade puzzle was "too hard" (4×4, either-or, near-minimal
> clues = high tier + deep steps) and then "too easy" (4×4, direct-only, padded = low tier,
> shallow). Same grid size, opposite feel — because **tier and depth, not grid size, were
> uncontrolled.** The score controls them directly.

---

## 4. Application: Logic Grid puzzles

Recommended presets derived from §1–§3 (to be confirmed by the §3 scorer). "Redundancy" =
extra direct givens added back to reduce required deduction depth.

| Grade | Categories × Items | Clue types allowed | Target: max tier / depth | Redundancy |
|---|---|---|---|---|
| 1 | 3 × 3 | direct, negative | T2 / shallow | high |
| 2 | 3 × 3 | direct, negative | T2–T3 | high |
| 3 | 3 × 4 | direct, negative | T3 | medium |
| 4 | 4 × 4 | direct, negative, **either-or** | T4 / short | medium |
| 5 | 4 × 4 | + **comparative** | T4 | low |
| 6 | 4 × 5 | either-or, comparative | T4–T5 | low |
| 7 | 5 × 5 | all | T5 | minimal |
| 8 | 5 × 5 (6 = challenge) | all | T5 / deepest | none |

This re-introduces **either-or at grade 4** (the lever that was missing when it felt too
easy) and **comparative at grade 5**, with redundancy as the fine-tuner so g4 lands between
the two extremes. Exact numbers get locked once the scorer reports real tier/step values.

## 5. Application: future games

Each new game maps its mechanics onto the same backbone:
- **Identify the core operations** the game requires and order them by P2 (assertion <
  elimination < disjunction < transitive < conditional, or the game's analog).
- **Find the dominant load lever** (P1) — for math packets it's number range / number of
  operands / regrouping, not "grid size."
- **Match reading level** (table §2) for any word-problem text.
- **Implement a tiered solver + score** (§3) and target per-grade bands.
- **Keep it solvable without guessing / with a clear method** (P5).

For math packets specifically (planned): derive operation/number-range bands per grade from
the §2 cognitive arc, and reuse the (max-tier, step-count, score) reporting shape.

---

## 6. Confirmed vs. open

**Confirmed (peer-reviewed, verified):** P1 (combinatorial load), P2 (inference difficulty
ordering), P3 (graded improvement 2→4→6 and transitive-with-age), P4 (alternatives > inhibition
for young solvers).

**Open / unverified here — re-source before relying:**
- Exact Common Core MP3 / NCTM "Reasoning & Proof" wording and any grade-banding (note: the
  8 CCSS Math Practices are *not* grade-banded — one set K-12, deepening with maturity).
- Specific Lexile-by-grade reading targets (the table §2 figures are commonly cited, not
  verified in our pass).
- Published puzzle-house difficulty taxonomies and explicit age recommendations (no
  publisher source survived verification).
- Developmental onset of *disjunctive* reasoning and exact age-appropriate *chain depth* —
  inferred here, not directly evidenced; the §3 scorer is how we manage them empirically.

---

## Sources (verified findings)

- Datsogianni, Sodian, Markovits & Ufer (2020). Conditional reasoning in primary grades.
  *Frontiers in Psychology* 11:531640. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.531640/full
- (2020). Transitive inference across ages (three- vs five-term).
  *Learning & Behavior*; PMC8219593. https://pmc.ncbi.nlm.nih.gov/articles/PMC8219593/
- de Chantal & Markovits (2016/2017). Generating alternatives > inhibition for preschool
  logical reasoning. *Memory & Cognition*. https://link.springer.com/article/10.3758/s13421-016-0653-4

Unverified-but-commonly-cited (for the open items above): thecorestandards.org/Math/Practice,
nctm.org Process Standards, lexile.com grade bands.
