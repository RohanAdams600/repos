# Crossover Lab

A 3D athlete lab for the NFL, MLB and NBA: a console-style showroom for each athlete, grades with
their formulas, weekly standouts found in the data, same-league versus events with seeded
replays, brackets and ladders, and a methodology page that says where every number comes from.

Unofficial fan/analytics tool, not affiliated with the NFL, MLB, NBA, teams, or players'
associations.

Every number in the app carries one of three labels:

| Label | Meaning |
|---|---|
| `VERIFIED` | Measured, and cited to the official source or to two independent publishers that state the same figure. Publisher, link and date are shown with it. |
| `ESTIMATED` | Derived by a stated formula, from a single publisher, or where publishers disagree (the note says how). Position norms and size adjustments are always estimates. |
| `SIMULATED` | No public source, or the outcome of a seeded simulation. Every versus result, bracket heat and ladder challenge is simulated. |

A grade, a contest result or a leaderboard entry takes the weakest label among its inputs.
Estimated or simulated values are never shown as verified.

## Run it

```bash
cd crossover-lab
npm install
npm run dev               # http://localhost:5173
npm test                  # data integrity, grades, sims, events, the figure and rig
npm run build             # type-checks, then writes a static site to dist/
npm run standouts:report  # this week's standouts as JSON (STANDOUTS_OUT=path to choose the file)
```

The build is a static site with relative paths, so `dist/` can go on any static host.

## Layout

Left rail: league, then club (all 92 NFL, MLB and NBA clubs), then athlete, with free agents,
legends, rookies and prospects grouped separately and a status filter (active, practice squad,
two-way, 10-day, injured reserve, free agent, legend, prospect, rookie). Center: the 3D stage
with a bottom timeline (play, scrub, frame step, 0.1× to 1× slow motion, clip recording) and
smart cameras (broadcast, sideline, behind, overhead, first person, close-up) that frame the
athletes automatically. Right: one focused panel. On screens under 1280 px the rail becomes a
drawer ("Browse"); under 900 px the stage sits above the panel.

An athlete page opens on a summary and a Key 6 strip, then one tab at a time: Overview,
Showroom, Movement, Metrics, Maps, Career, Gear, Injuries, Compare, Media. Each view has at most
one primary chart.

| Page | Hash | What it does |
|---|---|---|
| Athletes | `#roster`, `#a.<id>.<tab>` | The rail, the lineup and every athlete page. |
| Standouts | `#standouts.<league>` | Fastest, most explosive, strongest, best arms, rarest builds, rising, most improved, hidden gems. Each entry opens a "Why they stand out" card with the exact figure, its label, the rank among athletes on file (and the source's own rank wording, quoted), the percentile against position norms and the source and date. |
| Versus | `#events.<league>[.<event>[.<a>,<b>[.<seed>]]]` | Same-league events (below), seeded so a link replays the same result. |
| Crossover | `#versus`, `#m.<code>` | The original any-sport head-to-head, with size-adjusted rankings. |
| Brackets | `#brackets`, `#ladder.<code>` | Knockout brackets of 2 to 16 on one test, and challenge ladders kept in the browser with share links. |
| Decathlon, Leaders, Build, Cards | `#decathlon`, `#leaders`, `#build`, `#cards` | Multi-event scoring, leaderboards, build-an-athlete, weekly cards. |
| Methodology | `#methodology` | Labels, grade formulas, percentiles, the standouts engine, sources and licensing, the figure, the sims, the legal line, with counts computed from the data on file. |
| Sources | `#about` | Every source on file, athlete by athlete. |
| Import | `#import` | Add a roster from a CSV or a licensed feed export. |

## Versus events

| League | Events |
|---|---|
| NFL | 40-yard dash, route race (slant, out, curl, go, post, dig), tackle break (carrier vs tackler), QB accuracy and arm, pass rush (rusher vs blocker) |
| NBA | 1-on-1 shootout, vertical and lane agility, dunk contest, iso (handler vs defender) |
| MLB | Batter vs pitcher, home to first, outfield arm, fielding drill |
| All | Lift-off (bench, squat, deadlift, power clean) |

Picks default to the athletes with the most of the event's inputs on file. Each run is seeded
(same athletes and seed, same result; "Run again" draws a new seed). The stage uses one lane each
on a shared field, or one shared spot where the event has contact. The score card says who won,
what decided it, line by line, and which profile figures each sim read, with their labels and
sources. Races, jumps, lifts and arm events can open across leagues; those runs add size-adjusted
figures and are marked ESTIMATED.

## The figure

Each athlete is a skinned figure built from their measurements: height, weight, wingspan, hand
and foot size and body composition shape the skeleton and the body, with position morphs (a
lineman is built differently from a receiver at the same height). Materials are physically based
(skin with subsurface scatter, fabric sheen, clearcoat helmets), hair and braids are simulated
strands, loose cloth (shorts, untucked jerseys, baseball pants) sways with the hips, and gear is
league-accurate (helmet, facemask styles, visor, pads, sleeves, braces, batting helmet with the
flap on the correct side, caps, headbands).

**Likeness.** The face is a generic sculpt, never a likeness. The brief rules out photoreal faces
of real people without rights, so a real face or body only comes from a rights-cleared scan the
user loads in the Showroom with the licensor and licence reference, and it is shown with a
"Licensed scan" badge. Skin and hair are shown only when the profile has a sourced reference;
otherwise the figure is a neutral clay tone.

**Branding.** Kits use generic club colours and numbers. No logos, wordmarks or decals.

**Venues.** Stadium, ballpark and arena shells around the playing surfaces, with day and night
lighting. The crowd is an abstract texture; there are no sponsor boards.

## Data

```
src/data/types.ts             Athlete, Measured (value, label, source, date, quoted rank)
src/data/athletes/*.ts        The three full researched profiles
src/data/standouts/research.ts  Generated from the research log (see below)
src/data/standouts/profiles.ts  Standout profiles built from the research facts
src/data/teams.ts             All 92 clubs, divisions and colours (no marks)
src/data/import.ts            CSV roster import and its labelling rule
src/data/roster.ts            Built-in, standout, imported and custom athletes
src/grades/                   Grade formulas, position norms, overall weights
src/standouts/engine.ts       The standouts engine
src/sim/                      Sprint, jumps, lifts, throwing, at-bat, shooting, agility, NFL, NBA
                              and MLB event models, brackets and ladders, normalization
src/three/figure/             Body, head, hands and feet, hair, garments, gear, cloth, materials
src/three/                    Rig, viewer, cameras, environments, venues, motions, props
src/stage/                    Showroom, lineup, versus and event stages
src/ui/                       Rail, pages and components
research/                     Research logs (one JSON file per research date)
scripts/                      Research generator and the weekly standouts report
```

**Research.** Standout figures come from web research of public sources on 2026-10-14, followed
by an independent second search for each figure. A figure is `VERIFIED` only where two
independent publishers state it; one publisher, or publishers that disagree, gives `ESTIMATED`
with a note; a figure the check found wrong is left out. The log is
`research/standouts-2026-10-14.json`; `python3 scripts/gen-research.py [log]` regenerates
`src/data/standouts/research.ts`. Minor-league, spring-training and college figures are left out
because they are not comparable with league numbers.

**Standouts are refreshed weekly.** The `crossover-lab-standouts` GitHub Actions workflow runs
every Monday: it runs the tests, writes the week's lists with `npm run standouts:report` and
uploads them as a build artifact, and it warns when the research log is more than 35 days old.
The page itself rebuilds the lists for the current week whenever it opens. New figures enter
only through a new research log: the engine never invents numbers, and simulated values never
qualify.

**Full rosters.** The rail lists every club, but only athletes with researched or licensed data
appear. Practice squads, two-way and 10-day contracts and full 53/26/15-man rosters need a
licensed roster feed: export it to CSV and load it on the Import page. Imported figures are
`VERIFIED` only when the provider is licensed for this use and the row cites a source URL;
otherwise `ESTIMATED`. Imports stay in the browser that added them.

**Position norms** in `src/grades/norms.ts` are approximations and always surface as
`ESTIMATED`. Replace them with licensed norm tables before publishing grades.

## Scaling up

1. Connect a licensed stats feed and a tracking feed behind the `Measured` type; feed values
   arrive `VERIFIED` with their provider and date.
2. Load rosters from the feed instead of the CSV import; `roster.ts` is the only list to change.
3. Replace `norms.ts` with licensed norm tables per season.
4. Add media provider keys (`VITE_GETTY_API_KEY`, `VITE_AP_API_KEY`, `VITE_LEAGUE_MEDIA_KEY`).
5. Get group licensing from the players associations for names and statistics in a commercial
   product; keep kits generic unless the leagues license marks.

## Limits

- Motions are procedural (keyframed from each athlete's measured timing where there is one), not
  motion capture. Feet are placed by the poses, without inverse kinematics.
- Cloth is a driven sway, not a cloth solver.
- Simulations are models on the figures on file. They are not predictions.

## Performance and accessibility

- One shared WebGL renderer; resolution steps down when frames run long and back up with
  headroom, to hold 60 fps. Settings has a frame-rate readout.
- Every control works from the keyboard. Space plays or pauses, comma and period step frames,
  1 to 6 switch cameras, arrows and plus or minus orbit and zoom, C toggles captions, ? lists
  shortcuts, Escape closes the rail.
- Captions describe each phase of a motion and are announced to screen readers.
- Colour-blind-safe athlete palettes; heat maps in viridis, cividis or grayscale; quality labels
  use shape and glyph as well as colour; high-contrast and reduced-motion settings; light and dark
  themes.

## Legal

Unofficial fan/analytics tool, not affiliated with the NFL, MLB, NBA, teams, or players'
associations. Licensed media and data only: official pages are linked, never copied, and nothing
is scraped or rehosted.
