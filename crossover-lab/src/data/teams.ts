import type { League } from './types'

/**
 * Every club in the three leagues as of October 2026: NFL 32, MLB 30, NBA 30. Colors are
 * approximate hex values used only as generic kit colors; the app never draws a logo or wordmark.
 * `city` is the location part of the club name ("Golden State", "New England"), except the
 * Athletics, who play in Sacramento under the name "Athletics" with no city in it.
 */
export interface TeamColors {
  primary: string
  secondary: string
}

export interface Team {
  /** "<league lowercase>-<abbr lowercase>", e.g. 'nfl-ind'. */
  id: string
  league: League
  city: string
  name: string
  /** Display name: city plus name, or the name alone where the club drops the city. */
  fullName: string
  abbr: string
  /** Other abbreviations seen in public roster files (e.g. 'JAC', 'WSN', 'BRK'), for imports. */
  aliases: string[]
  /** 'AFC' | 'NFC', 'American League' | 'National League', 'Eastern Conference' | 'Western Conference'. */
  conference: string
  division: string
  colors: TeamColors
}

export interface Division {
  conference: string
  division: string
  teams: Team[]
}

/** conference, division, abbr, city, name, primary, secondary, aliases */
type Row = [string, string, string, string, string, string, string, string[]?]

const NFL: Row[] = [
  ['AFC', 'East', 'BUF', 'Buffalo', 'Bills', '#00338d', '#c60c30'],
  ['AFC', 'East', 'MIA', 'Miami', 'Dolphins', '#008e97', '#fc4c02'],
  ['AFC', 'East', 'NE', 'New England', 'Patriots', '#002244', '#c60c30', ['NWE']],
  ['AFC', 'East', 'NYJ', 'New York', 'Jets', '#125740', '#ffffff'],
  ['AFC', 'North', 'BAL', 'Baltimore', 'Ravens', '#241773', '#9e7c0c'],
  ['AFC', 'North', 'CIN', 'Cincinnati', 'Bengals', '#fb4f14', '#000000'],
  ['AFC', 'North', 'CLE', 'Cleveland', 'Browns', '#311d00', '#ff3c00'],
  ['AFC', 'North', 'PIT', 'Pittsburgh', 'Steelers', '#101820', '#ffb612'],
  ['AFC', 'South', 'HOU', 'Houston', 'Texans', '#03202f', '#a71930'],
  ['AFC', 'South', 'IND', 'Indianapolis', 'Colts', '#002c5f', '#ffffff'],
  ['AFC', 'South', 'JAX', 'Jacksonville', 'Jaguars', '#006778', '#d7a22a', ['JAC']],
  ['AFC', 'South', 'TEN', 'Tennessee', 'Titans', '#0c2340', '#4b92db'],
  ['AFC', 'West', 'DEN', 'Denver', 'Broncos', '#fb4f14', '#002244'],
  ['AFC', 'West', 'KC', 'Kansas City', 'Chiefs', '#e31837', '#ffb81c', ['KAN']],
  ['AFC', 'West', 'LV', 'Las Vegas', 'Raiders', '#000000', '#a5acaf', ['LVR']],
  ['AFC', 'West', 'LAC', 'Los Angeles', 'Chargers', '#0080c6', '#ffc20e'],
  ['NFC', 'East', 'DAL', 'Dallas', 'Cowboys', '#003594', '#869397'],
  ['NFC', 'East', 'NYG', 'New York', 'Giants', '#0b2265', '#a71930'],
  ['NFC', 'East', 'PHI', 'Philadelphia', 'Eagles', '#004c54', '#a5acaf'],
  ['NFC', 'East', 'WAS', 'Washington', 'Commanders', '#5a1414', '#ffb612', ['WSH']],
  ['NFC', 'North', 'CHI', 'Chicago', 'Bears', '#0b162a', '#c83803'],
  ['NFC', 'North', 'DET', 'Detroit', 'Lions', '#0076b6', '#b0b7bc'],
  ['NFC', 'North', 'GB', 'Green Bay', 'Packers', '#203731', '#ffb612', ['GNB']],
  ['NFC', 'North', 'MIN', 'Minnesota', 'Vikings', '#4f2683', '#ffc62f'],
  ['NFC', 'South', 'ATL', 'Atlanta', 'Falcons', '#a71930', '#000000'],
  ['NFC', 'South', 'CAR', 'Carolina', 'Panthers', '#0085ca', '#101820'],
  ['NFC', 'South', 'NO', 'New Orleans', 'Saints', '#101820', '#d3bc8d', ['NOR']],
  ['NFC', 'South', 'TB', 'Tampa Bay', 'Buccaneers', '#d50a0a', '#34302b', ['TAM']],
  ['NFC', 'West', 'ARI', 'Arizona', 'Cardinals', '#97233f', '#000000', ['ARZ']],
  ['NFC', 'West', 'LAR', 'Los Angeles', 'Rams', '#003594', '#ffa300', ['LA', 'RAM']],
  ['NFC', 'West', 'SF', 'San Francisco', '49ers', '#aa0000', '#b3995d', ['SFO']],
  ['NFC', 'West', 'SEA', 'Seattle', 'Seahawks', '#002244', '#69be28'],
]

const AL = 'American League'
const NL = 'National League'

const MLB: Row[] = [
  [AL, 'East', 'BAL', 'Baltimore', 'Orioles', '#df4601', '#000000'],
  [AL, 'East', 'BOS', 'Boston', 'Red Sox', '#bd3039', '#0c2340'],
  [AL, 'East', 'NYY', 'New York', 'Yankees', '#0c2340', '#c4ced3'],
  [AL, 'East', 'TB', 'Tampa Bay', 'Rays', '#092c5c', '#8fbce6', ['TBR', 'TBA']],
  [AL, 'East', 'TOR', 'Toronto', 'Blue Jays', '#134a8e', '#e8291c'],
  [AL, 'Central', 'CWS', 'Chicago', 'White Sox', '#27251f', '#c4ced4', ['CHW', 'CHA']],
  [AL, 'Central', 'CLE', 'Cleveland', 'Guardians', '#00385d', '#e50022'],
  [AL, 'Central', 'DET', 'Detroit', 'Tigers', '#0c2340', '#fa4616'],
  [AL, 'Central', 'KC', 'Kansas City', 'Royals', '#004687', '#bd9b60', ['KCR', 'KCA']],
  [AL, 'Central', 'MIN', 'Minnesota', 'Twins', '#002b5c', '#d31145'],
  [AL, 'West', 'ATH', 'Sacramento', 'Athletics', '#003831', '#efb21e', ['OAK']],
  [AL, 'West', 'HOU', 'Houston', 'Astros', '#002d62', '#eb6e1f'],
  [AL, 'West', 'LAA', 'Los Angeles', 'Angels', '#ba0021', '#003263', ['ANA']],
  [AL, 'West', 'SEA', 'Seattle', 'Mariners', '#0c2c56', '#005c5c'],
  [AL, 'West', 'TEX', 'Texas', 'Rangers', '#003278', '#c0111f'],
  [NL, 'East', 'ATL', 'Atlanta', 'Braves', '#13274f', '#ce1141'],
  [NL, 'East', 'MIA', 'Miami', 'Marlins', '#00a3e0', '#ef3340', ['FLA']],
  [NL, 'East', 'NYM', 'New York', 'Mets', '#002d72', '#ff5910', ['NYN']],
  [NL, 'East', 'PHI', 'Philadelphia', 'Phillies', '#e81828', '#002d72'],
  [NL, 'East', 'WSH', 'Washington', 'Nationals', '#ab0003', '#14225a', ['WSN', 'WAS']],
  [NL, 'Central', 'CHC', 'Chicago', 'Cubs', '#0e3386', '#cc3433', ['CHN']],
  [NL, 'Central', 'CIN', 'Cincinnati', 'Reds', '#c6011f', '#000000'],
  [NL, 'Central', 'MIL', 'Milwaukee', 'Brewers', '#12284b', '#ffc52f'],
  [NL, 'Central', 'PIT', 'Pittsburgh', 'Pirates', '#27251f', '#fdb827'],
  [NL, 'Central', 'STL', 'St. Louis', 'Cardinals', '#c41e3a', '#0c2340', ['SLN']],
  [NL, 'West', 'ARI', 'Arizona', 'Diamondbacks', '#a71930', '#e3d4ad', ['AZ']],
  [NL, 'West', 'COL', 'Colorado', 'Rockies', '#333366', '#c4ced4'],
  [NL, 'West', 'LAD', 'Los Angeles', 'Dodgers', '#005a9c', '#ef3e42', ['LAN']],
  [NL, 'West', 'SD', 'San Diego', 'Padres', '#2f241d', '#ffc425', ['SDP', 'SDN']],
  [NL, 'West', 'SF', 'San Francisco', 'Giants', '#fd5a1e', '#27251f', ['SFG', 'SFN']],
]

const EAST = 'Eastern Conference'
const WEST = 'Western Conference'

const NBA: Row[] = [
  [EAST, 'Atlantic', 'BOS', 'Boston', 'Celtics', '#007a33', '#ba9653'],
  [EAST, 'Atlantic', 'BKN', 'Brooklyn', 'Nets', '#000000', '#ffffff', ['BRK']],
  [EAST, 'Atlantic', 'NYK', 'New York', 'Knicks', '#006bb6', '#f58426', ['NY']],
  [EAST, 'Atlantic', 'PHI', 'Philadelphia', '76ers', '#006bb6', '#ed174c'],
  [EAST, 'Atlantic', 'TOR', 'Toronto', 'Raptors', '#ce1141', '#000000'],
  [EAST, 'Central', 'CHI', 'Chicago', 'Bulls', '#ce1141', '#000000'],
  [EAST, 'Central', 'CLE', 'Cleveland', 'Cavaliers', '#860038', '#fdbb30'],
  [EAST, 'Central', 'DET', 'Detroit', 'Pistons', '#c8102e', '#1d42ba'],
  [EAST, 'Central', 'IND', 'Indiana', 'Pacers', '#002d62', '#fdbb30'],
  [EAST, 'Central', 'MIL', 'Milwaukee', 'Bucks', '#00471b', '#eee1c6'],
  [EAST, 'Southeast', 'ATL', 'Atlanta', 'Hawks', '#e03a3e', '#c1d32f'],
  [EAST, 'Southeast', 'CHA', 'Charlotte', 'Hornets', '#1d1160', '#00788c', ['CHO']],
  [EAST, 'Southeast', 'MIA', 'Miami', 'Heat', '#98002e', '#f9a01b'],
  [EAST, 'Southeast', 'ORL', 'Orlando', 'Magic', '#0077c0', '#c4ced4'],
  [EAST, 'Southeast', 'WAS', 'Washington', 'Wizards', '#002b5c', '#e31837', ['WSH']],
  [WEST, 'Northwest', 'DEN', 'Denver', 'Nuggets', '#0e2240', '#fec524'],
  [WEST, 'Northwest', 'MIN', 'Minnesota', 'Timberwolves', '#0c2340', '#78be20'],
  [WEST, 'Northwest', 'OKC', 'Oklahoma City', 'Thunder', '#007ac1', '#ef3b24'],
  [WEST, 'Northwest', 'POR', 'Portland', 'Trail Blazers', '#e03a3e', '#000000'],
  [WEST, 'Northwest', 'UTA', 'Utah', 'Jazz', '#3e2680', '#000000', ['UTAH']],
  [WEST, 'Pacific', 'GSW', 'Golden State', 'Warriors', '#1d428a', '#ffc72c', ['GS']],
  [WEST, 'Pacific', 'LAC', 'LA', 'Clippers', '#c8102e', '#1d428a'],
  [WEST, 'Pacific', 'LAL', 'Los Angeles', 'Lakers', '#552583', '#fdb927'],
  [WEST, 'Pacific', 'PHX', 'Phoenix', 'Suns', '#1d1160', '#e56020', ['PHO']],
  [WEST, 'Pacific', 'SAC', 'Sacramento', 'Kings', '#5a2d81', '#63727a'],
  [WEST, 'Southwest', 'DAL', 'Dallas', 'Mavericks', '#00538c', '#b8c4ca'],
  [WEST, 'Southwest', 'HOU', 'Houston', 'Rockets', '#ce1141', '#000000'],
  [WEST, 'Southwest', 'MEM', 'Memphis', 'Grizzlies', '#5d76a9', '#12173f'],
  [WEST, 'Southwest', 'NOP', 'New Orleans', 'Pelicans', '#0c2340', '#c8102e', ['NO', 'NOR']],
  [WEST, 'Southwest', 'SAS', 'San Antonio', 'Spurs', '#000000', '#c4ced4', ['SA']],
]

/** Clubs whose name is used without a city. */
const NO_CITY_IN_NAME = new Set(['mlb-ath'])

function build(league: League, rows: Row[]): Team[] {
  return rows.map(([conference, division, abbr, city, name, primary, secondary, aliases]) => {
    const id = `${league.toLowerCase()}-${abbr.toLowerCase()}`
    return {
      id,
      league,
      city,
      name,
      fullName: NO_CITY_IN_NAME.has(id) ? name : `${city} ${name}`,
      abbr,
      aliases: aliases ?? [],
      conference,
      division,
      colors: { primary, secondary },
    }
  })
}

export const TEAMS: readonly Team[] = [...build('NFL', NFL), ...build('MLB', MLB), ...build('NBA', NBA)]

const BY_ID = new Map(TEAMS.map((t) => [t.id, t]))

export function teamsByLeague(league: League): Team[] {
  return TEAMS.filter((t) => t.league === league)
}

export function getTeam(id: string): Team | undefined {
  return BY_ID.get(id)
}

/** Case-insensitive; also matches the common alternates in `aliases`. */
export function getTeamByAbbr(league: League, abbr: string): Team | undefined {
  const key = abbr.trim().toUpperCase()
  if (!key) return undefined
  const list = teamsByLeague(league)
  return list.find((t) => t.abbr === key) ?? list.find((t) => t.aliases.includes(key))
}

/** Abbreviation, alias, full name ("Indianapolis Colts") or club name ("Colts"), case-insensitive. */
export function findTeam(league: League, text: string): Team | undefined {
  const byAbbr = getTeamByAbbr(league, text)
  if (byAbbr) return byAbbr
  const key = text.trim().toLowerCase()
  if (!key) return undefined
  return teamsByLeague(league).find((t) => t.fullName.toLowerCase() === key || t.name.toLowerCase() === key || `${t.city} ${t.name}`.toLowerCase() === key)
}

/** Divisions in table order (conference by conference), each with its clubs. */
export function divisions(league: League): Division[] {
  const out: Division[] = []
  for (const t of teamsByLeague(league)) {
    let d = out.find((x) => x.conference === t.conference && x.division === t.division)
    if (!d) {
      d = { conference: t.conference, division: t.division, teams: [] }
      out.push(d)
    }
    d.teams.push(t)
  }
  return out
}

/** Short label as fans say it: 'AFC South', 'AL West', 'Central'. */
export function divisionLabel(team: Team): string {
  if (team.league === 'NFL') return `${team.conference} ${team.division}`
  if (team.league === 'MLB') return `${team.conference === AL ? 'AL' : 'NL'} ${team.division}`
  return team.division
}
