/**
 * Motion catalogue for video analysis. Pure and client-safe: shared by the uploader, the report
 * and the kinematic engine so wording and side conventions never drift apart.
 *
 * Side conventions (handedness = the side the athlete bats, throws or shoots from):
 * - Lead side faces the target: front leg of a hitter, glove side of a pitcher or passer, the
 *   front leg of a skater shooting (a left shot faces the target with the right shoulder).
 * - Driving arm: the lead arm for a swing, the throwing arm for a pitch or pass, and the bottom
 *   hand on the stick for a hockey shot (left hand for a left shot).
 */

export type Motion = 'SWING' | 'PITCH' | 'HOCKEY_SHOT' | 'FOOTBALL_THROW'
export type SportName = 'BASEBALL' | 'HOCKEY' | 'FOOTBALL'

export const MOTIONS_BY_SPORT: Record<SportName, readonly Motion[]> = {
  BASEBALL: ['SWING', 'PITCH'],
  HOCKEY: ['HOCKEY_SHOT'],
  FOOTBALL: ['FOOTBALL_THROW'],
}

export const MOTION_LABELS: Record<Motion, string> = {
  SWING: 'Swing',
  PITCH: 'Pitch',
  HOCKEY_SHOT: 'Shot',
  FOOTBALL_THROW: 'Throw',
}

/** Word for the handedness control: "Bats right", "Shoots left". */
export const HANDEDNESS_VERB: Record<Motion, string> = {
  SWING: 'Bats',
  PITCH: 'Throws',
  HOCKEY_SHOT: 'Shoots',
  FOOTBALL_THROW: 'Throws',
}

export const FILMING_GUIDANCE: Record<Motion, string> = {
  SWING: 'Camera facing your chest, square to the line toward the pitcher, at hip height.',
  PITCH: 'Camera facing your chest, square to the line toward the plate, at hip height.',
  HOCKEY_SHOT: 'Camera facing your chest from the side boards, square to the line toward the net, at hip height. Film on ice or a shooting pad with your whole body and stick in frame.',
  FOOTBALL_THROW: 'Camera facing your chest from the side, square to the line of the throw, at hip height, with your whole body in frame through the follow-through.',
}

/** Wording used in findings so each report talks about the right body part and moment. */
export const MOTION_WORDS: Record<Motion, { arm: string; handPeak: string; plant: string; armFocus: string }> = {
  SWING: { arm: 'lead arm', handPeak: 'hands and barrel', plant: 'foot strike', armFocus: 'Keep the hands back until the trunk turns, avoiding an early push or cast.' },
  PITCH: { arm: 'throwing arm', handPeak: 'hand at release', plant: 'foot strike', armFocus: 'Delay arm acceleration until the trunk has rotated toward the target.' },
  HOCKEY_SHOT: {
    arm: 'bottom arm',
    handPeak: 'hands and stick',
    plant: 'weight transfer onto the front leg',
    armFocus: 'Let the hips and trunk turn toward the net before the hands pull the stick through.',
  },
  FOOTBALL_THROW: { arm: 'throwing arm', handPeak: 'hand at release', plant: 'front foot plant', armFocus: 'Let the hips and trunk open toward the target before the arm comes through.' },
}

export function motionsForSport(sport: SportName): readonly Motion[] {
  return MOTIONS_BY_SPORT[sport]
}

export function isMotionForSport(motion: Motion, sport: SportName): boolean {
  return MOTIONS_BY_SPORT[sport].includes(motion)
}

/** What object tracking follows for each motion. */
export const PROJECTILE_NOUN: Record<Motion, string> = { SWING: 'ball', PITCH: 'ball', HOCKEY_SHOT: 'puck', FOOTBALL_THROW: 'ball' }
