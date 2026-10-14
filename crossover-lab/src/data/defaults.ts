import type { BodySegment, GearItem, GearKind, GearSlot, GearVariant, Hotspot, Kit, League, MovementSignature } from './types'
import type { TeamColors } from './teams'

/**
 * Default kit and movement for athletes who have no reference photos or tracking data yet, such
 * as rows from a roster import. Everything here is SIMULATED: it is what the position usually
 * wears and how it usually moves, not what this athlete does, and it is replaced as soon as
 * reference photos or video are added.
 */
export const DEFAULT_KIT_BASIS = 'Default kit for the position until reference photos are added'

/** Kit colors for athletes without a club (free agents, prospects, some legends). */
export const NEUTRAL_COLORS: TeamColors = { primary: '#4b5563', secondary: '#d1d5db' }

/** Batting and throwing hands, when known. Unknown hands default to right-handed. */
export interface Hands {
  bats?: 'L' | 'R' | 'S'
  throws?: 'L' | 'R'
}

type Side = 'L' | 'R'

const WHITE = '#f4f4f2'
const ROAD_GRAY = '#b8bcc2'
const BLACK = '#16181d'
const MASK_GRAY = '#9aa1a8'
const LEATHER = '#6b4423'
const BRACE = '#2b2f36'

const GROUPS: Record<League, string[]> = {
  NFL: ['RB', 'WR', 'TE', 'QB', 'DB', 'LB', 'DL', 'OL', 'ST'],
  MLB: ['H', 'P', 'TWP'],
  NBA: ['G', 'W', 'B'],
}

/** Same fallbacks as positionGroupFor, so an unknown group still gets a sensible kit. */
const FALLBACK: Record<League, string> = { NFL: 'RB', MLB: 'H', NBA: 'G' }

function knownGroup(league: League, group: string): string {
  return GROUPS[league].includes(group) ? group : FALLBACK[league]
}

function other(side: Side): Side {
  return side === 'L' ? 'R' : 'L'
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of a #rgb or #rrggbb color; anything unparseable counts as black. */
function luminance(hex: string): number {
  let h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (x) => x + x)
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0
  const n = parseInt(h, 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG contrast ratio, 1 (same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Home jersey color: team primary, except baseball, where home whites are the norm. */
export function jerseyColor(league: League, colors: TeamColors): string {
  return league === 'MLB' ? WHITE : colors.primary
}

/** Number color: the first candidate legible on the jersey (contrast 3:1), else the best one. */
function numberColor(jersey: string, candidates: string[]): string {
  const legible = candidates.find((c) => contrastRatio(c, jersey) >= 3)
  if (legible) return legible
  return candidates.reduce((best, c) => (contrastRatio(c, jersey) > contrastRatio(best, jersey) ? c : best), BLACK)
}

/** Generic kit from club colors. `trim` is the number color and is always legible on the jersey. */
export function defaultKit(league: League, colors: TeamColors, number = ''): Kit {
  const jersey = jerseyColor(league, colors)
  const candidates = league === 'MLB' ? [colors.primary, colors.secondary, BLACK] : [colors.secondary, WHITE, BLACK]
  return { primary: colors.primary, secondary: colors.secondary, trim: numberColor(jersey, candidates), number }
}

function hs(segment: BodySegment, along: number, face: Hotspot['face'], intensity: number, label: string): Hotspot {
  return { segment, along, face, intensity, label }
}

interface Spec {
  slot: GearSlot
  kind: GearKind
  name: string
  color: string
  accent?: string
  description: string
  /** Defaults to true; optional extras sit in the closet with false. */
  worn?: boolean
  /** Defaults to 100 when worn and 0 when not. */
  usagePct?: number
  note: string
  hotspots: Hotspot[]
  variants?: GearVariant[]
  defaultVariant?: string
}

function make(prefix: string, s: Spec): GearItem {
  const worn = s.worn ?? true
  return {
    id: `${prefix}-${s.slot}`,
    slot: s.slot,
    kind: s.kind,
    name: s.name,
    color: s.color,
    ...(s.accent ? { accent: s.accent } : {}),
    description: s.description,
    quality: 'SIMULATED',
    basis: DEFAULT_KIT_BASIS,
    worn,
    ...(s.variants ? { variants: s.variants, defaultVariant: s.defaultVariant ?? s.variants[0]?.id } : {}),
    use: { usagePct: s.usagePct ?? (worn ? 100 : 0), quality: 'SIMULATED', note: s.note, hotspots: s.hotspots },
  }
}

const NO_LOGO = 'No logo or wordmark: generic team colors only.'

function nflGear(group: string, c: TeamColors, prefix: string, hands: Hands): GearItem[] {
  const line = group === 'OL' || group === 'DL'
  const catcher = group === 'WR' || group === 'TE' || group === 'RB' || group === 'DB'
  const throwSide: Side = hands.throws === 'L' ? 'L' : 'R'
  const offHand = other(throwSide)

  const helmetSpots: Record<string, Hotspot[]> = {
    OL: [hs('head', 0.35, 'front', 0.9, 'Front of shell (contact off the snap)'), hs('head', 0.1, 'top', 0.5, 'Crown')],
    DL: [hs('head', 0.35, 'front', 0.9, 'Front of shell (contact off the snap)'), hs('head', 0.1, 'top', 0.5, 'Crown')],
    QB: [hs('head', 0.5, 'back', 0.65, 'Back of shell (sacks and falls)'), hs('head', 0.5, 'outer', 0.4, 'Side of shell (hits in the pocket)')],
    WR: [hs('head', 0.5, 'outer', 0.55, 'Side of shell (tackles in space)'), hs('head', 0.5, 'back', 0.45, 'Back of shell (falls to the turf)')],
    DB: [hs('head', 0.5, 'outer', 0.6, 'Side of shell (open-field tackles)'), hs('head', 0.5, 'back', 0.4, 'Back of shell (falls to the turf)')],
    ST: [hs('head', 0.1, 'top', 0.25, 'Crown (coverage collisions)')],
  }
  const jerseySpots: Record<string, Hotspot[]> = {
    OL: [hs('chest', 0.4, 'front', 0.95, 'Chest plate (hand placement)'), hs('chest', 0.15, 'top', 0.7, 'Shoulder pads')],
    DL: [hs('chest', 0.4, 'front', 0.95, 'Chest plate (hand placement)'), hs('chest', 0.15, 'top', 0.7, 'Shoulder pads')],
    QB: [hs('chest', 0.45, 'front', 0.3, 'Chest (hits in the pocket)'), hs('abdomen', 0.5, 'back', 0.4, 'Back (sacks from behind)')],
    WR: [hs('chest', 0.5, 'back', 0.55, 'Back panel (grabs at the catch point)'), hs('chest', 0.2, 'outer', 0.5, 'Shoulder (press coverage)')],
    TE: [hs('chest', 0.4, 'front', 0.7, 'Chest (blocking)'), hs('chest', 0.5, 'back', 0.45, 'Back panel (grabs at the catch point)')],
    DB: [hs('chest', 0.15, 'top', 0.75, 'Shoulder pads (tackling)'), hs('chest', 0.2, 'outer', 0.5, 'Shoulder (press coverage)')],
    LB: [hs('chest', 0.15, 'top', 0.8, 'Shoulder pads (tackling)'), hs('chest', 0.45, 'front', 0.6, 'Chest (taking on blocks)')],
    ST: [hs('chest', 0.15, 'top', 0.4, 'Shoulder pads (coverage)')],
    RB: [
      hs('chest', 0.45, 'front', 0.8, 'Ball-carry side of the chest'),
      hs('chest', 0.15, 'top', 0.65, 'Shoulder pads (contact)'),
      hs('abdomen', 0.5, 'back', 0.45, 'Back hem (grabs from behind)'),
    ],
  }
  const shoeSpots: Record<string, Hotspot[]> = {
    OL: [hs('footL', 0.75, 'bottom', 0.9, 'Forefoot drive (blocking)'), hs('footR', 0.75, 'bottom', 0.9, 'Forefoot drive (blocking)'), hs('footL', 0.55, 'inner', 0.55, 'Inside edge (pass-set slides)')],
    DL: [hs('footL', 0.75, 'bottom', 0.95, 'Forefoot drive (get-off)'), hs('footR', 0.75, 'bottom', 0.95, 'Forefoot drive (get-off)'), hs('footR', 0.55, 'inner', 0.6, 'Inside edge (rush moves)')],
    QB: [hs(`foot${throwSide}`, 0.7, 'bottom', 0.8, 'Back foot (dropback plant and throw)'), hs(`foot${offHand}`, 0.15, 'bottom', 0.6, 'Front foot heel (stride into the throw)')],
    ST: [hs(`foot${offHand}`, 0.2, 'bottom', 0.8, 'Plant foot'), hs(`foot${throwSide}`, 0.6, 'top', 0.9, 'Kicking foot instep (dominant side assumed)')],
    DB: [
      hs('footL', 0.75, 'bottom', 1, 'Forefoot push-off'),
      hs('footR', 0.75, 'bottom', 1, 'Forefoot push-off'),
      hs('footL', 0.55, 'inner', 0.85, 'Inside edge (breaks on the ball)'),
      hs('footR', 0.1, 'bottom', 0.6, 'Heel (backpedal)'),
    ],
  }
  const skillShoes = [
    hs('footL', 0.75, 'bottom', 1, 'Forefoot push-off'),
    hs('footR', 0.75, 'bottom', 1, 'Forefoot push-off'),
    hs('footL', 0.55, 'inner', 0.85, 'Inside edge on cuts'),
    hs('footR', 0.55, 'inner', 0.85, 'Inside edge on cuts'),
  ]

  const maskStyle = line ? 'closed' : group === 'TE' || group === 'LB' ? 'standard' : 'open'
  const maskName = line ? 'Lineman facemask' : maskStyle === 'standard' ? 'Standard facemask' : 'Skill-position facemask'
  const gloveName = line ? 'Lineman gloves' : catcher ? 'Tacky-palm skill gloves' : group === 'LB' ? 'Linebacker gloves' : 'Gloves'
  const gloveSpots: Hotspot[] = line
    ? [hs('handL', 0.5, 'front', 0.9, 'Palm (punch and grab)'), hs('handR', 0.5, 'front', 0.9, 'Palm (punch and grab)'), hs('handL', 0.5, 'back', 0.6, 'Padded back (hand fighting)'), hs('handR', 0.5, 'back', 0.6, 'Padded back (hand fighting)')]
    : catcher
      ? [hs('handL', 0.5, 'front', 0.85, 'Palm (catching)'), hs('handR', 0.5, 'front', 0.85, 'Palm (catching)'), hs('handL', 0.9, 'front', 0.75, 'Fingertips'), hs('handR', 0.9, 'front', 0.75, 'Fingertips')]
      : group === 'QB'
        ? [hs(`hand${offHand}`, 0.5, 'front', 0.4, 'Off-hand palm (ball security)')]
        : [hs('handL', 0.5, 'front', 0.7, 'Palm (shedding blocks and tackling)'), hs('handR', 0.5, 'front', 0.7, 'Palm (shedding blocks and tackling)')]
  // Most quarterbacks throw bare-handed and kickers rarely wear gloves, so for them gloves are closet items.
  const glovesWorn = group !== 'QB' && group !== 'ST'

  const items: GearItem[] = [
    make(prefix, {
      slot: 'helmet',
      kind: 'helmet',
      name: 'Helmet',
      color: c.primary,
      accent: c.secondary,
      description: `Shell in the team primary with a center stripe in the secondary. ${NO_LOGO}`,
      note: 'Worn every snap. Impact zones follow where the position usually takes contact.',
      hotspots: helmetSpots[group] ?? [hs('head', 0.35, 'front', 0.8, 'Front and crown (contact at low pad level)'), hs('head', 0.5, 'outer', 0.45, 'Side of shell')],
    }),
    make(prefix, {
      slot: 'facemask',
      kind: 'facemask',
      name: maskName,
      color: MASK_GRAY,
      description: line ? 'Closed cage with extra bars, the usual choice on the line.' : maskStyle === 'standard' ? 'Three-bar mask: a balance of protection and view.' : 'Open mask with few bars for a wide field of view.',
      note: line ? 'Hands strike the mask in the trenches.' : 'Contact from arm tackles and stiff-arms.',
      hotspots: [hs('head', 0.7, 'front', line ? 0.75 : 0.5, line ? 'Bars (hand strikes in the trenches)' : 'Lower bars')],
      variants: [
        { id: 'open', label: 'Open (2 bars)', style: 'open' },
        { id: 'standard', label: 'Standard (3 bars)', style: 'standard' },
        { id: 'closed', label: 'Closed (4 bars)', style: 'closed' },
      ],
      defaultVariant: maskStyle,
    }),
    make(prefix, {
      slot: 'chinStrap',
      kind: 'helmet',
      name: 'Chin strap',
      color: WHITE,
      description: 'Hard-cup chin strap that keeps the helmet seated.',
      note: 'Worn every snap with the helmet.',
      hotspots: [hs('head', 0.95, 'bottom', 0.35, 'Chin cup')],
    }),
    make(prefix, {
      slot: 'jersey',
      kind: 'jersey',
      name: 'Home jersey',
      color: c.primary,
      accent: c.secondary,
      description: `Jersey in the team primary with numerals and shoulder stripes in the secondary, cut tight to the pads. ${NO_LOGO}`,
      note: 'Grabs and contact concentrate where the position takes them.',
      hotspots: jerseySpots[group] ?? jerseySpots.RB ?? [],
      variants: [
        { id: 'home', label: 'Home (team color)', color: c.primary },
        { id: 'road', label: 'Road (white)', color: WHITE },
      ],
      defaultVariant: 'home',
    }),
    make(prefix, {
      slot: 'pants',
      kind: 'bottoms',
      name: 'Game pants',
      color: c.secondary,
      accent: c.primary,
      description: 'Pants in the team secondary with a side stripe in the primary, over thigh and knee pads.',
      note: line ? 'Knees take the load in a three-point stance and in pile-ups.' : 'Knee and thigh pads take hits from tacklers aiming low.',
      hotspots: line
        ? [hs('thighL', 0.85, 'front', 0.75, 'Knee pad (stance and pile-ups)'), hs('thighR', 0.85, 'front', 0.75, 'Knee pad (stance and pile-ups)')]
        : [hs('thighL', 0.85, 'front', 0.55, 'Knee pad'), hs('thighR', 0.85, 'front', 0.55, 'Knee pad'), hs('thighR', 0.4, 'outer', 0.45, 'Thigh pad')],
    }),
    make(prefix, {
      slot: 'gloves',
      kind: 'gloves',
      name: group === 'QB' ? 'Off-hand glove' : gloveName,
      color: c.primary,
      accent: c.secondary,
      description: line ? 'Padded-back gloves for hand fighting.' : group === 'QB' ? 'Many quarterbacks wear one on the non-throwing hand in cold or wet games.' : 'Gloves with a tacky palm.',
      worn: glovesWorn,
      note: glovesWorn ? 'Wear follows how the position uses its hands.' : 'Closet item: not usually worn by the position.',
      hotspots: gloveSpots,
    }),
    make(prefix, {
      slot: 'socks',
      kind: 'socks',
      name: 'Team socks',
      color: c.primary,
      description: 'Socks in the team primary pulled to just under the knee.',
      note: 'Friction at the heel and forefoot inside the cleat.',
      hotspots: [hs('shinL', 0.95, 'around', 0.3, 'Ankle'), hs('shinR', 0.95, 'around', 0.3, 'Ankle')],
    }),
    make(prefix, {
      slot: 'shoes',
      kind: 'shoes',
      name: 'Cleats',
      color: c.primary,
      accent: WHITE,
      description: line ? 'Mid-cut cleats for ankle support in the trenches.' : 'Low-cut cleats.',
      note: 'Push-off loads the forefoot; cuts and slides load the edges.',
      hotspots: shoeSpots[group] ?? skillShoes,
      variants: [
        { id: 'low', label: 'Low-cut, molded studs', style: 'low' },
        { id: 'mid', label: 'Mid-cut, detachable studs', style: 'mid' },
        { id: 'turf', label: 'Turf shoe', style: 'turf' },
      ],
      defaultVariant: line ? 'mid' : 'low',
    }),
    make(prefix, {
      slot: 'visor',
      kind: 'facemask',
      name: 'Tinted visor',
      color: '#1f2937',
      description: 'Optional extra. Available to try on.',
      worn: false,
      note: 'Would take hand contact from arm tackles.',
      hotspots: [hs('head', 0.5, 'front', 0.4, 'Visor face')],
    }),
  ]
  if (group === 'OL') {
    items.push(
      make(prefix, {
        slot: 'kneeBrace',
        kind: 'brace',
        name: 'Hinged knee braces',
        color: BRACE,
        description: 'Optional extra. Many linemen wear them to guard against blows from the side.',
        worn: false,
        note: 'Would take side impacts when a player rolls into the knee.',
        hotspots: [hs('shinL', 0.05, 'outer', 0.7, 'Knee hinge (blows from the side)'), hs('shinR', 0.05, 'outer', 0.7, 'Knee hinge (blows from the side)')],
      }),
    )
  }
  return items
}

function mlbGear(group: string, c: TeamColors, prefix: string, hands: Hands): GearItem[] {
  const pitcher = group === 'P'
  const twoWay = group === 'TWP'
  const lefty = hands.bats === 'L'
  const top: Side = lefty ? 'L' : 'R'
  const lead: Side = lefty ? 'R' : 'L'
  const throwSide: Side = hands.throws === 'L' ? 'L' : 'R'
  const gloveSide = other(throwSide)

  const items: GearItem[] = []
  if (!pitcher) {
    items.push(
      make(prefix, {
        slot: 'battingHelmet',
        kind: 'helmet',
        name: 'Batting helmet with jaw flap',
        color: c.primary,
        description: `Helmet in the team primary. The flap covers the side that faces the pitcher. ${NO_LOGO}`,
        note: 'Worn every plate appearance and on the bases. Pitched-ball risk faces the mound.',
        hotspots: [hs('head', 0.6, 'outer', 0.7, 'Flap side facing the pitcher'), hs('head', 0.2, 'top', 0.3, 'Crown (headfirst slides)')],
      }),
    )
  }
  items.push(
    make(prefix, {
      slot: 'cap',
      kind: 'cap',
      name: 'Team cap',
      color: c.primary,
      accent: c.secondary,
      description: `Cap in the team primary. ${NO_LOGO}`,
      worn: pitcher,
      usagePct: pitcher ? 100 : twoWay ? 30 : 50,
      note: pitcher ? 'Worn on the mound.' : 'Worn in the field, not at the plate.',
      hotspots: [],
    }),
  )
  if (!pitcher) {
    items.push(
      make(prefix, {
        slot: 'battingGloves',
        kind: 'gloves',
        name: 'Batting gloves',
        color: WHITE,
        accent: c.primary,
        description: 'Leather-palm batting gloves.',
        note: 'Grip pressure sits at the base of the fingers of both hands, highest on the top hand.',
        hotspots: [
          hs(`hand${top}`, 0.65, 'front', 0.95, 'Top hand, base of fingers'),
          hs(`hand${other(top)}`, 0.65, 'front', 0.75, 'Bottom hand, base of fingers'),
          hs(`hand${other(top)}`, 0.35, 'inner', 0.5, 'Bottom hand heel (knob contact)'),
        ],
      }),
    )
  }
  items.push(
    make(prefix, {
      slot: 'fieldingGlove',
      kind: 'gloves',
      name: pitcher || twoWay ? "Pitcher's glove" : 'Fielding glove',
      color: LEATHER,
      description: pitcher || twoWay ? 'Closed-web glove that hides the grip.' : 'Leather fielding glove.',
      worn: pitcher,
      usagePct: pitcher ? 100 : twoWay ? 30 : 50,
      note: pitcher ? 'Worn on the glove hand every pitch.' : twoWay ? 'Worn only in pitching appearances.' : 'Worn in the field; a designated hitter never wears it.',
      hotspots: [hs(`hand${gloveSide}`, 0.7, 'front', 0.6, 'Pocket')],
    }),
    make(prefix, {
      slot: 'jersey',
      kind: 'jersey',
      name: 'Home jersey',
      color: WHITE,
      accent: c.primary,
      description: `White button-front jersey with trim and numerals in the team primary. ${NO_LOGO}`,
      note: pitcher ? 'Stress at the throwing shoulder and across the back in the follow-through.' : 'Stress at the shoulders through the swing; slides wear the front panel.',
      hotspots: pitcher
        ? [hs('chest', 0.15, 'top', 0.75, 'Throwing-shoulder seam'), hs('chest', 0.5, 'back', 0.4, 'Back panel (follow-through)')]
        : [hs('chest', 0.15, 'top', 0.6, 'Shoulder seams'), hs('chest', 0.5, 'front', 0.35, 'Front panel (slides)')],
      variants: [
        { id: 'home', label: 'Home (white)', color: WHITE },
        { id: 'road', label: 'Road (gray)', color: ROAD_GRAY },
        { id: 'alternate', label: 'Alternate (team color)', color: c.primary },
      ],
      defaultVariant: 'home',
    }),
    make(prefix, {
      slot: 'pants',
      kind: 'bottoms',
      name: 'White pants',
      color: WHITE,
      accent: c.primary,
      description: 'White pants with piping in the team primary, worn to just below the knee.',
      note: pitcher ? 'The landing knee flexes hard at foot strike.' : 'Slides wear the outside of the hip and thigh.',
      hotspots: pitcher ? [hs(`thigh${gloveSide}`, 0.85, 'front', 0.5, 'Landing-leg knee')] : [hs('thighL', 0.4, 'outer', 0.55, 'Sliding hip')],
    }),
    make(prefix, {
      slot: 'socks',
      kind: 'socks',
      name: 'Team socks',
      color: c.primary,
      description: 'Socks in the team primary pulled to the knee.',
      note: 'Little wear.',
      hotspots: [hs('shinL', 0.95, 'around', 0.2, 'Ankle'), hs('shinR', 0.95, 'around', 0.2, 'Ankle')],
    }),
    make(prefix, {
      slot: 'shoes',
      kind: 'shoes',
      name: 'Metal-spike cleats',
      color: c.primary,
      accent: WHITE,
      description: 'Low-cut spikes.',
      note: pitcher ? 'The drive foot pushes off the rubber and drags through; the landing foot brakes.' : 'The back foot drives off its inside edge in the swing; the front foot plants on the stride.',
      hotspots: pitcher
        ? [hs(`foot${throwSide}`, 0.6, 'inner', 0.8, 'Drive foot along the rubber'), hs(`foot${gloveSide}`, 0.4, 'bottom', 0.9, 'Landing foot plant'), hs(`foot${throwSide}`, 0.85, 'top', 0.6, 'Toe drag (follow-through)')]
        : [hs(`foot${top}`, 0.6, 'inner', 0.9, 'Back foot inside edge (swing drive)'), hs(`foot${lead}`, 0.4, 'bottom', 0.75, 'Front foot plant'), hs(`foot${lead}`, 0.8, 'bottom', 0.5, 'Forefoot (baserunning)')],
      variants: [
        { id: 'low', label: 'Low-cut metal spikes', style: 'low' },
        { id: 'mid', label: 'Mid-cut metal spikes', style: 'mid' },
        { id: 'turf', label: 'Turf trainers', style: 'turf' },
      ],
      defaultVariant: 'low',
    }),
  )
  if (!pitcher) {
    items.push(
      make(prefix, {
        slot: 'elbowGuard',
        kind: 'guard',
        name: 'Lead elbow guard',
        color: c.primary,
        description: 'Optional extra. Molded guard for the lead elbow, which faces the pitcher.',
        worn: false,
        note: 'Would take inside pitches off the lead arm.',
        hotspots: [hs(`upperArm${lead}`, 0.95, 'outer', 0.8, 'Point of the elbow')],
      }),
      make(prefix, {
        slot: 'legGuard',
        kind: 'guard',
        name: 'Lead leg guard',
        color: c.primary,
        description: 'Optional extra. Shin and ankle guard for the front leg.',
        worn: false,
        note: 'Would take foul tips off the front foot and shin.',
        hotspots: [hs(`shin${lead}`, 0.6, 'front', 0.85, 'Front shin'), hs(`shin${lead}`, 0.95, 'inner', 0.6, 'Inside ankle')],
      }),
    )
  }
  return items
}

function nbaGear(group: string, c: TeamColors, prefix: string): GearItem[] {
  const big = group === 'B'
  const shoeSpots: Record<string, Hotspot[]> = {
    G: [
      hs('footL', 0.75, 'bottom', 1, 'Forefoot (takeoff)'),
      hs('footR', 0.75, 'bottom', 0.95, 'Forefoot (takeoff)'),
      hs('footL', 0.5, 'outer', 0.75, 'Outside edge (crossovers)'),
      hs('footR', 0.15, 'bottom', 0.45, 'Heel (landing)'),
    ],
    W: [
      hs('footL', 0.75, 'bottom', 0.95, 'Forefoot (takeoff)'),
      hs('footR', 0.75, 'bottom', 0.95, 'Forefoot (takeoff)'),
      hs('footR', 0.5, 'inner', 0.7, 'Inside edge (closeouts)'),
      hs('footL', 0.15, 'bottom', 0.55, 'Heel (landing)'),
    ],
    B: [
      hs('footL', 0.15, 'bottom', 0.8, 'Heel (landings off rebounds)'),
      hs('footR', 0.15, 'bottom', 0.8, 'Heel (landings off rebounds)'),
      hs('footL', 0.75, 'bottom', 0.85, 'Forefoot (takeoff)'),
      hs('footR', 0.5, 'outer', 0.5, 'Outside edge (post pivots)'),
    ],
  }
  const items: GearItem[] = [
    make(prefix, {
      slot: 'jersey',
      kind: 'jersey',
      name: 'Team-color jersey',
      color: c.primary,
      accent: c.secondary,
      description: `Sleeveless jersey in the team primary with numerals in a contrasting color. ${NO_LOGO}`,
      note: big ? 'Post-ups, box-outs and screens put contact on the chest and shoulders.' : 'Contact on drives and screens.',
      hotspots: big
        ? [hs('chest', 0.4, 'front', 0.8, 'Chest (post-ups and box-outs)'), hs('chest', 0.2, 'outer', 0.7, 'Shoulder (screens)'), hs('abdomen', 0.5, 'back', 0.5, 'Lower back (box-outs)')]
        : [hs('chest', 0.4, 'front', 0.55, 'Chest (drives into contact)'), hs('chest', 0.2, 'outer', group === 'W' ? 0.5 : 0.4, 'Shoulder (screens)')],
      variants: [
        { id: 'icon', label: 'Team color', color: c.primary },
        { id: 'association', label: 'White', color: WHITE },
      ],
      defaultVariant: 'icon',
    }),
    make(prefix, {
      slot: 'shorts',
      kind: 'bottoms',
      name: 'Team-color shorts',
      color: c.primary,
      accent: c.secondary,
      description: 'Knee-length shorts with a side panel in the team secondary.',
      note: 'Little wear.',
      hotspots: [],
    }),
    make(prefix, {
      slot: 'socks',
      kind: 'socks',
      name: 'White crew socks',
      color: WHITE,
      description: 'Cushioned crew socks.',
      note: 'Friction at the heel on hard stops.',
      hotspots: [hs('shinL', 0.95, 'around', 0.3, 'Ankle'), hs('shinR', 0.95, 'around', 0.3, 'Ankle')],
    }),
    make(prefix, {
      slot: 'shoes',
      kind: 'shoes',
      name: big ? 'High-top court shoes' : group === 'W' ? 'Mid-top court shoes' : 'Low-top court shoes',
      color: WHITE,
      accent: c.primary,
      description: big ? 'High-tops for ankle support under the basket.' : 'Court shoes with a herringbone sole.',
      note: 'Takeoff loads the forefoot; stops, cuts and landings load the edges and heel.',
      hotspots: shoeSpots[group] ?? shoeSpots.G ?? [],
      variants: [
        { id: 'low', label: 'Low-top', style: 'low' },
        { id: 'mid', label: 'Mid-top', style: 'mid' },
        { id: 'high', label: 'High-top', style: 'high' },
      ],
      defaultVariant: big ? 'high' : group === 'W' ? 'mid' : 'low',
    }),
    make(prefix, {
      slot: 'headband',
      kind: 'wristband',
      name: 'Headband',
      color: WHITE,
      description: 'Optional extra. Available to try on.',
      worn: false,
      note: 'Keeps sweat out of the eyes; no contact wear.',
      hotspots: [],
    }),
  ]
  if (!big) {
    items.push(
      make(prefix, {
        slot: 'shootingSleeveR',
        kind: 'compression',
        name: 'Shooting sleeve',
        color: c.primary,
        description: 'Optional extra. Available to try on.',
        worn: false,
        note: 'Would sit on the shooting arm, which takes the most repetitions.',
        hotspots: [hs('forearmR', 0.3, 'back', 0.6, 'Back of the forearm (follow-through)'), hs('upperArmR', 0.9, 'back', 0.45, 'Elbow')],
      }),
    )
  }
  if (group !== 'G') {
    items.push(
      make(prefix, {
        slot: 'kneeSleeves',
        kind: 'compression',
        name: 'Knee sleeves',
        color: BLACK,
        description: 'Optional extra. Available to try on.',
        worn: false,
        note: 'Would cover the knees, which take the load on landings.',
        hotspots: [hs('shinL', 0.05, 'front', 0.7, 'Front of the knee'), hs('shinR', 0.05, 'front', 0.6, 'Front of the knee')],
      }),
    )
  }
  return items
}

/**
 * Generic, position-appropriate kit in club colors. Every item is SIMULATED with the default-kit
 * basis; item ids are `<idPrefix>-<slot>`. Unknown groups fall back to the league default group.
 */
export function defaultGear(league: League, group: string, colors: TeamColors, idPrefix: string, hands: Hands = {}): GearItem[] {
  const g = knownGroup(league, group)
  if (league === 'NFL') return nflGear(g, colors, idPrefix, hands)
  if (league === 'MLB') return mlbGear(g, colors, idPrefix, hands)
  return nbaGear(g, colors, idPrefix)
}

type Run = MovementSignature['run']

/** Stride and cadence put top speed (stride × cadence / 60) in the usual range for the group. */
const RUN: Record<string, Run> = {
  RB: { strideLengthM: 2.2, cadenceSpm: 272, leanDeg: 12, armSwingDeg: 50, kneeDriveDeg: 78, style: 'Compact and forward-leaning, ball tucked in one arm.' },
  WR: { strideLengthM: 2.45, cadenceSpm: 260, leanDeg: 8, armSwingDeg: 65, kneeDriveDeg: 82, style: 'Long, upright stride with a full arm swing.' },
  TE: { strideLengthM: 2.25, cadenceSpm: 255, leanDeg: 10, armSwingDeg: 55, kneeDriveDeg: 72, style: 'Long stride for a big frame, slightly forward.' },
  QB: { strideLengthM: 2.15, cadenceSpm: 255, leanDeg: 8, armSwingDeg: 55, kneeDriveDeg: 70, style: 'Upright scramble stride, ball held high.' },
  DB: { strideLengthM: 2.35, cadenceSpm: 268, leanDeg: 9, armSwingDeg: 62, kneeDriveDeg: 80, style: 'Fluid, long stride that turns and runs from a backpedal.' },
  LB: { strideLengthM: 2.2, cadenceSpm: 262, leanDeg: 11, armSwingDeg: 55, kneeDriveDeg: 75, style: 'Forward-leaning pursuit stride.' },
  DL: { strideLengthM: 1.95, cadenceSpm: 265, leanDeg: 14, armSwingDeg: 50, kneeDriveDeg: 68, style: 'Short, powerful steps from a low start.' },
  OL: { strideLengthM: 1.8, cadenceSpm: 260, leanDeg: 14, armSwingDeg: 45, kneeDriveDeg: 60, style: 'Short, choppy stride with a low center of mass.' },
  ST: { strideLengthM: 2.05, cadenceSpm: 255, leanDeg: 7, armSwingDeg: 55, kneeDriveDeg: 70, style: 'Model default.' },
  H: { strideLengthM: 2.1, cadenceSpm: 255, leanDeg: 8, armSwingDeg: 60, kneeDriveDeg: 72, style: 'Upright stride rounding the bases.' },
  P: { strideLengthM: 1.95, cadenceSpm: 250, leanDeg: 7, armSwingDeg: 55, kneeDriveDeg: 68, style: 'Model default; pitchers rarely sprint in games.' },
  TWP: { strideLengthM: 2.15, cadenceSpm: 255, leanDeg: 8, armSwingDeg: 60, kneeDriveDeg: 70, style: 'Long, upright stride.' },
  G: { strideLengthM: 2.05, cadenceSpm: 280, leanDeg: 10, armSwingDeg: 65, kneeDriveDeg: 80, style: 'Quick, high-frequency steps with a big arm swing.' },
  W: { strideLengthM: 2.15, cadenceSpm: 270, leanDeg: 9, armSwingDeg: 62, kneeDriveDeg: 78, style: 'Long, gliding transition stride.' },
  B: { strideLengthM: 2.2, cadenceSpm: 255, leanDeg: 7, armSwingDeg: 55, kneeDriveDeg: 70, style: 'Long, upright rim-run stride.' },
}

/** Position-typical movement. SIMULATED: replace with the athlete's own from video or tracking. */
export function defaultMovement(league: League, group: string, hands: Hands = {}): MovementSignature {
  const g = knownGroup(league, group)
  const line = g === 'OL' || g === 'DL'
  const run = { ...(RUN[g] ?? RUN.RB!) }

  const throwSig: MovementSignature['throw'] =
    g === 'QB'
      ? { armSlotDeg: 75, hipShoulderSeparationDeg: 45, strideLengthPctHeight: 60, style: 'Dropback throw: compact high three-quarter release with full hip-shoulder separation.' }
      : g === 'P' || g === 'TWP'
        ? { armSlotDeg: 55, hipShoulderSeparationDeg: 45, strideLengthPctHeight: 85, style: 'Three-quarter delivery with a long stride toward the plate.' }
        : g === 'H'
          ? { armSlotDeg: 60, hipShoulderSeparationDeg: 35, strideLengthPctHeight: 55, style: "Fielder's crow-hop throw from a three-quarter slot." }
          : league === 'NBA'
            ? { armSlotDeg: 80, hipShoulderSeparationDeg: 25, strideLengthPctHeight: 40, style: 'Overhead outlet pass.' }
            : { armSlotDeg: 70, hipShoulderSeparationDeg: 25, strideLengthPctHeight: 40, style: 'Model default: short-stride throw.' }

  const shoot: MovementSignature['shoot'] =
    g === 'G'
      ? { releaseAngleDeg: 48, setPointPct: 0.07, jumpOnShot: true, style: 'Quick one-motion jumper from above the forehead.' }
      : g === 'W'
        ? { releaseAngleDeg: 46, setPointPct: 0.08, jumpOnShot: true, style: 'High set point over the top of closeouts.' }
        : g === 'B'
          ? { releaseAngleDeg: 50, setPointPct: 0.06, jumpOnShot: true, style: 'Soft, high-arc touch shot near the rim.' }
          : { releaseAngleDeg: 50, setPointPct: 0.06, jumpOnShot: true, style: 'Model default.' }

  const swing: MovementSignature['swing'] =
    g === 'H'
      ? { attackAngleDeg: 10, legKick: 'small', batsLeft: hands.bats === 'L', style: 'Small leg kick and a slightly uphill bat path.' }
      : g === 'TWP'
        ? { attackAngleDeg: 12, legKick: 'toe-tap', batsLeft: hands.bats === 'L', style: 'Toe-tap timing and an uphill bat path.' }
        : g === 'P'
          ? { attackAngleDeg: 6, legKick: 'small', batsLeft: hands.bats === 'L', style: 'Model default; pitchers rarely bat under the universal DH.' }
          : { attackAngleDeg: 8, legKick: 'small', batsLeft: hands.bats === 'L', style: 'Model default.' }

  const jump: MovementSignature['jump'] =
    g === 'G'
      ? { takeoff: 'one-foot', landingKneeFlexDeg: 68, armDrive: 1, style: 'Bounce off one foot in transition.' }
      : g === 'W'
        ? { takeoff: 'one-foot', landingKneeFlexDeg: 66, armDrive: 0.95, style: 'Long-stride one-foot takeoff on the break.' }
        : g === 'B'
          ? { takeoff: 'two-foot', landingKneeFlexDeg: 62, armDrive: 0.85, style: 'Two-foot gather and power jump in traffic.' }
          : line
            ? { takeoff: 'two-foot', landingKneeFlexDeg: 75, armDrive: 0.8, style: 'Deep countermovement for a heavy frame.' }
            : { takeoff: 'two-foot', landingKneeFlexDeg: 70, armDrive: 0.85, style: 'Two-foot takeoff with an arm swing.' }

  return {
    quality: 'SIMULATED',
    basis: `Typical movement for the position group (${g}) until reference video or tracking data is added. Not measured on this athlete.`,
    run,
    throw: throwSig,
    shoot,
    swing,
    jump,
  }
}
