import { ordinal } from '@/lib/metrics/percentile'
import type { EventKind, MetricType, MotionType, Position, RecruitingPeriodKind, Sport } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'
import { INTL_LOCALE } from '@/i18n/config'
import { defineMessages, pick } from '@/i18n/define'
import type { FindingCode } from '@/lib/biomechanics/types'

type Domain = {
  sport: Record<Sport, string>
  metric: Record<MetricType, string>
  metricShort: Record<MetricType, string>
  position: Record<Position, string>
  motion: Record<MotionType, string>
  focus: Record<FindingCode, string>
  eventKind: Record<EventKind, string>
  period: Record<RecruitingPeriodKind, string>
}

/** Names of sports, measurements, positions and other fixed values, in each language. */
export const domainMessages = defineMessages<Domain>(
  {
    sport: { BASEBALL: 'Baseball', HOCKEY: 'Hockey', FOOTBALL: 'Football' },
    metric: {
      EXIT_VELOCITY: 'Exit velocity',
      PITCH_VELO: 'Pitch velocity',
      SIXTY_YARD_DASH: '60-yard dash',
      POP_TIME: 'Pop time',
      INFIELD_VELO: 'Infield velocity',
      OUTFIELD_VELO: 'Outfield velocity',
      BAT_SPEED: 'Bat speed',
      SLAPSHOT_SPEED: 'Slapshot speed',
      WRIST_SHOT_SPEED: 'Wrist shot speed',
      THROW_VELOCITY: 'Throw velocity',
      THROW_DISTANCE: 'Throw distance',
      SPIRAL_EFFICIENCY: 'Spiral efficiency',
      FORTY_YARD_DASH: '40-yard dash',
    },
    metricShort: {
      EXIT_VELOCITY: 'Exit velo',
      PITCH_VELO: 'Pitch velo',
      SIXTY_YARD_DASH: '60 yd',
      POP_TIME: 'Pop',
      INFIELD_VELO: 'IF velo',
      OUTFIELD_VELO: 'OF velo',
      BAT_SPEED: 'Bat speed',
      SLAPSHOT_SPEED: 'Slapshot',
      WRIST_SHOT_SPEED: 'Wrist shot',
      THROW_VELOCITY: 'Throw velo',
      THROW_DISTANCE: 'Distance',
      SPIRAL_EFFICIENCY: 'Spiral',
      FORTY_YARD_DASH: '40 yd',
    },
    position: {
      RHP: 'Right-handed pitcher',
      LHP: 'Left-handed pitcher',
      CATCHER: 'Catcher',
      FIRST_BASE: 'First base',
      SECOND_BASE: 'Second base',
      SHORTSTOP: 'Shortstop',
      THIRD_BASE: 'Third base',
      OUTFIELD: 'Outfield',
      UTILITY: 'Utility',
      CENTER: 'Center',
      WING: 'Wing',
      DEFENSE: 'Defense',
      GOALIE: 'Goalie',
      QUARTERBACK: 'Quarterback',
      RUNNING_BACK: 'Running back',
      WIDE_RECEIVER: 'Wide receiver',
      TIGHT_END: 'Tight end',
      OFFENSIVE_LINE: 'Offensive line',
      DEFENSIVE_LINE: 'Defensive line',
      LINEBACKER: 'Linebacker',
      DEFENSIVE_BACK: 'Defensive back',
      SPECIALIST: 'Kicker or punter',
    },
    motion: { SWING: 'Swing', PITCH: 'Pitch', HOCKEY_SHOT: 'Hockey shot', FOOTBALL_THROW: 'Throw' },
    focus: {
      TRUNK_LEADS_PELVIS: 'Hips start the rotation',
      ARM_LEADS_TRUNK: 'Trunk before arm',
      HAND_LEADS_ARM: 'Arm before hand',
      LOW_HIP_SHOULDER_SEPARATION: 'Hip and shoulder separation',
      SEGMENTS_FIRE_TOGETHER: 'Sequencing one segment at a time',
      NO_SPEED_GAIN_PELVIS_TO_TRUNK: 'Speed transfer from hips to trunk',
    },
    eventKind: { SHOWCASE: 'Showcase', CAMP: 'Camp', COMBINE: 'Combine', TOURNAMENT: 'Tournament' },
    period: { CONTACT: 'Contact period', EVALUATION: 'Evaluation period', QUIET: 'Quiet period', DEAD: 'Dead period' },
  },
  {
    sport: { BASEBALL: 'Béisbol', HOCKEY: 'Hockey', FOOTBALL: 'Fútbol americano' },
    metric: {
      EXIT_VELOCITY: 'Velocidad de salida',
      PITCH_VELO: 'Velocidad de lanzamiento',
      SIXTY_YARD_DASH: 'Carrera de 60 yardas',
      POP_TIME: 'Pop time',
      INFIELD_VELO: 'Velocidad de brazo en el infield',
      OUTFIELD_VELO: 'Velocidad de brazo en el outfield',
      BAT_SPEED: 'Velocidad del bate',
      SLAPSHOT_SPEED: 'Velocidad del slapshot',
      WRIST_SHOT_SPEED: 'Velocidad del tiro de muñeca',
      THROW_VELOCITY: 'Velocidad de pase',
      THROW_DISTANCE: 'Distancia de pase',
      SPIRAL_EFFICIENCY: 'Eficiencia de la espiral',
      FORTY_YARD_DASH: 'Carrera de 40 yardas',
    },
    metricShort: {
      EXIT_VELOCITY: 'Vel. salida',
      PITCH_VELO: 'Vel. lanz.',
      SIXTY_YARD_DASH: '60 yd',
      POP_TIME: 'Pop',
      INFIELD_VELO: 'Vel. IF',
      OUTFIELD_VELO: 'Vel. OF',
      BAT_SPEED: 'Vel. bate',
      SLAPSHOT_SPEED: 'Slapshot',
      WRIST_SHOT_SPEED: 'Tiro muñeca',
      THROW_VELOCITY: 'Vel. pase',
      THROW_DISTANCE: 'Distancia',
      SPIRAL_EFFICIENCY: 'Espiral',
      FORTY_YARD_DASH: '40 yd',
    },
    position: {
      RHP: 'Lanzador derecho',
      LHP: 'Lanzador zurdo',
      CATCHER: 'Receptor',
      FIRST_BASE: 'Primera base',
      SECOND_BASE: 'Segunda base',
      SHORTSTOP: 'Campocorto',
      THIRD_BASE: 'Tercera base',
      OUTFIELD: 'Jardinero',
      UTILITY: 'Utility',
      CENTER: 'Centro',
      WING: 'Ala',
      DEFENSE: 'Defensa',
      GOALIE: 'Portero',
      QUARTERBACK: 'Quarterback',
      RUNNING_BACK: 'Running back',
      WIDE_RECEIVER: 'Receptor abierto',
      TIGHT_END: 'Tight end',
      OFFENSIVE_LINE: 'Línea ofensiva',
      DEFENSIVE_LINE: 'Línea defensiva',
      LINEBACKER: 'Linebacker',
      DEFENSIVE_BACK: 'Back defensivo',
      SPECIALIST: 'Pateador',
    },
    motion: { SWING: 'Swing', PITCH: 'Lanzamiento', HOCKEY_SHOT: 'Tiro de hockey', FOOTBALL_THROW: 'Pase' },
    focus: {
      TRUNK_LEADS_PELVIS: 'Las caderas inician la rotación',
      ARM_LEADS_TRUNK: 'El tronco antes que el brazo',
      HAND_LEADS_ARM: 'El brazo antes que la mano',
      LOW_HIP_SHOULDER_SEPARATION: 'Separación entre caderas y hombros',
      SEGMENTS_FIRE_TOGETHER: 'Secuencia de un segmento a la vez',
      NO_SPEED_GAIN_PELVIS_TO_TRUNK: 'Transferencia de velocidad de caderas a tronco',
    },
    eventKind: { SHOWCASE: 'Showcase', CAMP: 'Campamento', COMBINE: 'Combine', TOURNAMENT: 'Torneo' },
    period: { CONTACT: 'Periodo de contacto', EVALUATION: 'Periodo de evaluación', QUIET: 'Periodo de silencio', DEAD: 'Periodo muerto' },
  },
)

export function domain(locale: Locale): Domain {
  return pick(domainMessages, locale)
}

/** Dates in the reader's language, always in UTC (stored dates are calendar days). */
export function formatDay(date: Date, locale: Locale, style: 'long' | 'short' = 'long'): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], { year: 'numeric', month: style, day: 'numeric', timeZone: 'UTC' })
}

export function formatDayRange(start: Date, end: Date, locale: Locale): string {
  if (start.getTime() === end.getTime()) return formatDay(start, locale)
  return `${formatDay(start, locale)} ${locale === 'es' ? 'al' : 'to'} ${formatDay(end, locale)}`
}

/** A class percentile as a short label: "90th" in English, "percentil 90" in Spanish. */
export function percentileLabel(n: number, locale: Locale): string {
  return locale === 'es' ? `percentil ${n}` : ordinal(n)
}

/** A metric's name in both languages, for notifications and emails written ahead of time. */
export function metricName(type: MetricType): { en: string; es: string } {
  return { en: domainMessages.en.metric[type], es: domainMessages.es.metric[type] }
}
