# Crossover Lab

A 3D athlete lab for the NFL, MLB and NBA: video-game style grades, gear profiles with a wear
and stress heat map, then-versus-now comparisons, a biomechanics lab, and cross-sport
head-to-head simulations. This is the three-athlete demo for approval; the data layer is built
to scale to full rosters.

Every number in the app carries one of three labels:

| Label | Meaning |
|---|---|
| `VERIFIED` | Checked against the cited public source on the date shown. |
| `ESTIMATED` | Derived from verified figures by a stated formula, or the sources disagree (the note says how). |
| `SIMULATED` | No public source. A demo value until a licensed data feed is connected. |

A grade, a contest result or a leaderboard entry takes the weakest label among its inputs.

## Run it

```bash
cd crossover-lab
npm install
npm run dev        # http://localhost:5173
npm test           # data integrity, grades, simulations, the 3D rig
npm run build      # type-checks, then writes a static site to dist/
```

The build is a static site with relative paths, so `dist/` can go on any static host.

## What is in the demo

| Area | Where | Notes |
|---|---|---|
| Roster | `#roster` | The three demo athletes side by side, each running his signature motion. |
| Grades (0 to 99) | Athlete page, Grades tab | Shared, NFL, MLB and NBA sub-grades, pitch grades, overall, data mix bar, grade history by season. Hover or focus a grade for its formula, inputs, sources and position-adjusted percentile. |
| Gear | Gear tab | Gear profile from the reference photos (NFL) or a labeled demo kit; toggle and swap items; "why it matters" notes; gear use heat map on the 3D model; gear history. Generic team colors, no logos. |
| Media | Media tab | Official pages and licensed providers, each with source and date. Nothing is scraped or rehosted. Reference photos a viewer adds stay in that browser tab. |
| Then vs now | Then vs now tab | Season slider, side-by-side photo slots, annotated changes (body, production, grades, gear, mechanics) and a ghost of the earlier body on the stage. |
| Body | Body tab | Height, weight, BMI, wingspan, ape index, hands, body fat, lean and fat mass, tagged on the model; muscle and fat map. |
| Injuries | Injuries tab | Sourced injury timeline with a body map and highlights on the model. |
| Biomechanics lab | Biomech lab tab | Ghost overlay of a second athlete, joint-angle curves, rotation speeds, sprint ground reaction force. |
| Replay | Replay tab and the stage transport | 0.1× to 1×, frame by frame, broadcast, behind, overhead and first-person cameras, captions, clip recording. |
| Head-to-head | `#versus` | Sprint (10, 20, 40 yd; 100, 200 m) with live readout and photo finish; jumps; lift-off with reps and leaderboard rank; arm strength (velocity, distance, accuracy targets) for three balls; at-bat duel with strike zone and swing outcome probabilities; free throws, three-point contest and shot chart challenge; 5-10-5, 3-cone, lane agility, sit and reach. Size-adjusted rankings, share links, clips. |
| Decathlon | `#decathlon` | Pick events and athletes; decathlon-style points; podium. |
| Leaderboards | `#leaders` | Any metric or grade, filtered by league and data label; fastest, strongest and highest jumper across the three leagues. |
| Build-an-athlete | `#build` | Blend two athletes trait group by trait group and save to the roster (this browser only). |
| Dynasty cards | `#cards` | Weekly cards with an eight-week line. |
| AR | "View in AR" on the stage | WebXR life-size placement on supporting phones; GLB and USDZ export elsewhere. |

## Data

```
src/data/types.ts           Athlete, Measured (value + label + source), gear, media, injuries
src/data/athletes/*.ts      One file per athlete
src/data/roster.ts          The roster; add a file here and every page picks it up
src/data/resolve.ts         Metric lookup by season, derived figures
src/data/media.ts           Media providers (official link-outs; Getty, AP and league feeds by key)
src/grades/                 Grade formulas and position norms
src/sim/                    Sprint model, jumps, lifts, throwing, at-bat, shooting, agility,
                            decathlon scoring, normalization, build-an-athlete, dynasty cards
src/three/                  Viewer, procedural rig, motions, environments, props, AR export
src/stage/                  Scenes that put athletes and props on the stage over time
src/ui/                     Pages and components
```

**Sources and dates.** Each athlete file lists its sources with the date they were checked. The
demo profiles were researched on 2026-10-14 from public pages (league and team sites, ESPN,
CBS Sports, MLB.com Statcast clips, combine reports). Where public sources disagree, the figure
is `ESTIMATED` and the note names both values. Where no public source exists (lift maxes, body
fat, most movement data), the figure is `SIMULATED`. The Data page in the app lists every source.

**Reference photos.** The five photos supplied with the brief were used to describe the NFL
athlete's kit (white helmet, gray open facemask, blue jersey with white shoulder stripes, blue
gloves, white pants with a blue stripe, blue socks, blue cleats, blue sideline cap) and his
right-arm carry. They are not committed or displayed: the brief rules out rehosting media.

**Position norms** in `src/grades/norms.ts` are approximations written for the demo and always
surface as `ESTIMATED`. Replace them with licensed norm tables before publishing grades.

## Scaling to full rosters

1. Connect a licensed stats feed (for example Sportradar or Stats Perform) and a tracking feed
   (NFL Next Gen Stats, Statcast, NBA tracking) behind the `Measured` type: each feed value
   arrives `VERIFIED` with its provider and date.
2. Generate athlete files, or load them at runtime, from the feed instead of hand-written files.
   `roster.ts` is the only list to change.
3. Replace `norms.ts` with licensed position norm tables per season.
4. Add media provider keys (`VITE_GETTY_API_KEY`, `VITE_AP_API_KEY`, `VITE_LEAGUE_MEDIA_KEY`).
5. Run the dynasty card job weekly from the feed (see `src/sim/dynasty.ts`); the week-to-week
   line is simulated until then.
6. Get group licensing from the players associations for names and statistics in a commercial
   product; keep kits generic unless the leagues license marks.

## Performance and accessibility

- One shared WebGL renderer and one shadow-casting light; resolution steps down when frames run
  over 19 ms and back up with headroom, to hold 60 fps. Settings has a frame-rate readout.
- Every control works from the keyboard. Space plays or pauses, comma and period step frames,
  1 to 4 switch cameras, arrows and plus or minus orbit and zoom the focused stage, C toggles
  captions, ? lists shortcuts.
- Captions describe each phase of a motion, pitch and shot and are announced to screen readers.
- Athlete colors use color-blind-safe sets (Okabe-Ito, Tol bright, IBM); heat maps use viridis,
  cividis or grayscale; quality labels use shape and glyph as well as color; high-contrast mode
  and reduced motion are in Settings.
- Light and dark themes follow the device, or pick one in Settings.

## Fairness

Head-to-head results are simulated from the data on file. They are not predictions.
