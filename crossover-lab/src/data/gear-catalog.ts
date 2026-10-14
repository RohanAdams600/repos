import type { GearSlot } from './types'

export interface GearInfo {
  label: string
  /** Plain-language note on what the item does. Claims stay within what research supports. */
  why: string
  category: 'Protection' | 'Traction' | 'Grip' | 'Compression' | 'Uniform' | 'Comfort'
}

export const GEAR_INFO: Record<GearSlot, GearInfo> = {
  helmet: {
    label: 'Helmet',
    category: 'Protection',
    why: 'Spreads and slows impact forces to the head. Shell and liner choice trade weight against energy absorption; leagues publish lab rankings of approved models.',
  },
  facemask: {
    label: 'Facemask',
    category: 'Protection',
    why: 'Fewer bars give a wider field of view; more bars protect the face better. Skill positions usually pick open masks so they can track the ball and defenders.',
  },
  visor: {
    label: 'Visor',
    category: 'Protection',
    why: 'Cuts glare and blocks eye pokes. Tinted visors need league approval.',
  },
  cap: {
    label: 'Sideline cap',
    category: 'Comfort',
    why: 'Keeps the head warm or shaded between series and in warm-ups. Not worn during play.',
  },
  battingHelmet: {
    label: 'Batting helmet',
    category: 'Protection',
    why: 'Protects the head and, with a jaw flap, the face from pitched balls. The flap sits on the side facing the pitcher.',
  },
  headband: {
    label: 'Headband',
    category: 'Comfort',
    why: 'Keeps sweat out of the eyes. Purely a comfort item.',
  },
  jersey: {
    label: 'Jersey',
    category: 'Uniform',
    why: 'Tight cuts give defenders less to grab. Fabric weight affects heat and sweat management.',
  },
  undershirt: {
    label: 'Undershirt',
    category: 'Comfort',
    why: 'Wicks sweat and, under pads, cuts chafing. Long sleeves add warmth in cold games.',
  },
  pants: {
    label: 'Pants',
    category: 'Uniform',
    why: 'Hold thigh and knee pads in place. Fit matters more than fabric for movement.',
  },
  shorts: {
    label: 'Shorts',
    category: 'Uniform',
    why: 'Loose cut for full hip range of motion on cuts and jumps.',
  },
  compressionSleeveL: {
    label: 'Compression sleeve (left)',
    category: 'Compression',
    why: 'Can reduce muscle vibration and keep the arm warm; evidence that sleeves improve performance is mixed. Also protects skin from turf burns.',
  },
  compressionSleeveR: {
    label: 'Compression sleeve (right)',
    category: 'Compression',
    why: 'Can reduce muscle vibration and keep the arm warm; evidence that sleeves improve performance is mixed. Also protects skin from turf burns.',
  },
  shootingSleeveR: {
    label: 'Shooting sleeve',
    category: 'Compression',
    why: 'Mostly about warmth and feel on the shooting arm; studies show no consistent change in shooting accuracy.',
  },
  gloves: {
    label: 'Gloves',
    category: 'Grip',
    why: 'Tacky palms improve ball security, especially in wet games. Palm and fingertip wear show where the ball sits on carries and catches.',
  },
  battingGloves: {
    label: 'Batting gloves',
    category: 'Grip',
    why: 'Improve grip on the bat and soften vibration on mishits. Wear concentrates at the base of the fingers and the top hand palm.',
  },
  fieldingGlove: {
    label: 'Fielding glove',
    category: 'Grip',
    why: 'Pocket depth and web style vary by position: deeper for outfielders, shallower for quick transfers in the infield.',
  },
  wristbands: {
    label: 'Wristbands',
    category: 'Comfort',
    why: 'Absorb sweat before it reaches the hands. Some players also use them for play-call cards.',
  },
  elbowGuard: {
    label: 'Elbow guard',
    category: 'Protection',
    why: 'Protects the lead elbow, which faces the pitcher, from hit-by-pitches.',
  },
  legGuard: {
    label: 'Leg guard',
    category: 'Protection',
    why: 'Protects the front shin and ankle from foul balls off the bat.',
  },
  kneeSleeves: {
    label: 'Knee sleeves',
    category: 'Compression',
    why: 'Keep the knee warm and may help joint position sense. Padded versions protect against floor burns and knocks.',
  },
  socks: {
    label: 'Socks',
    category: 'Comfort',
    why: 'Cushioning and grip inside the shoe cut blisters; crew height also protects the lower leg from turf burns.',
  },
  shoes: {
    label: 'Shoes and cleats',
    category: 'Traction',
    why: 'Stud pattern and length set how much the shoe grips on cuts. More grip means sharper cuts but more torque on the knee and ankle.',
  },
}
