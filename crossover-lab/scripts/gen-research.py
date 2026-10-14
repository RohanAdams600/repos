"""
Regenerate src/data/standouts/research.ts from a research log (research/standouts-<date>.json).

Usage: python3 scripts/gen-research.py [path/to/log.json]

Labelling rules (see the methodology page): a figure is VERIFIED only when an independent second
publisher confirmed it; single-source or disputed figures are ESTIMATED with a note saying why;
figures a check found wrong are dropped; minor-league, spring-training and college figures are
left out. Rank wording is only ever the source's own, quoted.
"""
import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'research', 'standouts-2026-10-14.json')
OUT = os.path.join(ROOT, 'src', 'data', 'standouts', 'research.ts')
METRICS = set(re.findall(r'^  ([a-zA-Z0-9]+): \{', open(os.path.join(ROOT, 'src', 'data', 'metrics.ts')).read(), re.M))
log = json.load(open(LOG))
d = {'result': [{'league': l['league'], 'found': {'athletes': l['athletes'], 'notes': l['notes']}, 'verdicts': l['verdicts']} for l in log['leagues']]}
recheck = {(v['name'], v['metric'], round(float(v['claimedValue']), 3)): v for v in log.get('recheck', [])}

SKIP_CONTEXT = re.compile(r'college|Triple-A|Single-A|Double-A|Spring Training|minor-league|pre-draft testing at', re.I)
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def js(v): return json.dumps(v, ensure_ascii=False)

def ts_str(v):
    return "'" + v.replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ') + "'"
def to_ts(o, ind):
    pad = '  ' * (ind + 1)
    end = '  ' * ind
    if isinstance(o, dict):
        if not o: return '{}'
        return '{\n' + ''.join(f"{pad}{k}: {to_ts(v, ind + 1)},\n" for k, v in o.items()) + end + '}'
    if isinstance(o, list):
        if not o: return '[]'
        return '[\n' + ''.join(f"{pad}{to_ts(v, ind + 1)},\n" for v in o) + end + ']'
    if isinstance(o, bool): return 'true' if o else 'false'
    if isinstance(o, (int, float)):
        return repr(int(o)) if float(o).is_integer() else repr(o)
    return ts_str(str(o))

athletes = []
stats = {'VERIFIED': 0, 'ESTIMATED': 0, 'dropped': 0, 'skipped': 0}
for lg in d['result']:
    league = lg['league']
    orig = {}
    for v in lg['verdicts']:
        orig.setdefault((v['name'], v['metric']), []).append(v)
    for a in lg['found']['athletes']:
        facts = []
        team = a['team']
        for f in a['facts']:
            if f['metric'] not in METRICS or SKIP_CONTEXT.search(f['context']):
                stats['skipped'] += 1
                continue
            cands = orig.get((a['name'], f['metric']), [])
            v = next((x for x in cands if abs(float(x['claimedValue']) - float(f['value'])) < 1e-6), cands[0] if cands else None)
            rv = recheck.get((a['name'], f['metric'], round(float(f['value']), 3)))
            unchecked_orig = v is not None and 'budget' in v['reasoning'].lower() and v['verdict'] == 'unconfirmed'
            if rv and rv.get('checked', True):
                v = rv
                rank_checked = rv.get('rankChecked', True)
            else:
                rank_checked = not unchecked_orig
            verdict = v['verdict'] if v else 'unconfirmed'
            if verdict == 'wrong':
                stats['dropped'] += 1
                continue
            if v and v.get('currentTeam'):
                team = v['currentTeam']
            quality = 'VERIFIED' if verdict == 'confirmed' else 'ESTIMATED'
            stats[quality] += 1
            src = {'title': f['sourceTitle'], 'publisher': f['publisher'], 'url': f['url']}
            if re.match(r'^\d{4}-\d{2}-\d{2}$', f.get('published') or ''): src['published'] = f['published']
            second = None
            if v and v.get('secondUrl') and verdict in ('confirmed', 'conflicting') and v['secondUrl'] != f['url']:
                second = {'title': v.get('secondSourceTitle') or v.get('secondPublisher'), 'publisher': v.get('secondPublisher') or '', 'url': v['secondUrl']}
            ctx = f['context'].rstrip('.')
            if verdict == 'confirmed':
                note = f"{ctx}. Reported by {f['publisher']} and confirmed by {second['publisher'] if second else 'a second source'}."
            elif verdict == 'conflicting':
                note = f"{ctx}. Sources disagree: {v.get('alternative') or 'another source gives a different figure'}. Shown as ESTIMATED until they agree."
            else:
                why = 'the cross-check ran out of searches before reaching it' if (v is None or not (rv and rv.get('checked', True))) and unchecked_orig else 'no independent second source turned up'
                note = f"{ctx}. Reported by {f['publisher']}; {why}, so it is not marked VERIFIED."
            fact = {'metric': f['metric'], 'value': float(f['value']), 'quality': quality, 'asOf': f['date'], 'category': f['category'], 'context': f['context'], 'source': src, 'note': note}
            if second: fact['confirmedBy'] = second
            claim = (f.get('rankClaim') or '').strip()
            if claim:
                ok = bool(v and v.get('rankClaimOk'))
                if rank_checked and ok:
                    fact['rank'] = claim
                elif not rank_checked:
                    fact['rank'] = claim
                    fact['note'] += f" The rank wording is {f['publisher']}'s own and was not independently checked."
            facts.append(fact)
        if not facts:
            continue
        rec = {'id': slug(a['name'].replace('(Tariq) ', '')), 'name': a['name'].replace('Riq (Tariq) Woolen', 'Riq Woolen'), 'league': league, 'position': a['position'], 'team': team, 'status': a['status']}
        if a.get('era'): rec['era'] = a['era']
        if any('undrafted' in f['context'].lower() for f in facts): rec['undrafted'] = True
        rec['facts'] = facts
        athletes.append(rec)

lines = ["import type { League, MetricKey, Quality, RosterStatus } from '../types'", '',
"/**",
" * Standout figures gathered by web research on 2026-10-14 and cross-checked by an independent",
" * second search. Generated from the research log; edit the log and regenerate rather than",
" * hand-editing values. Labels:",
" * - VERIFIED: two independent publishers state the same figure for the same event or season.",
" * - ESTIMATED: one publisher only, or publishers disagree (the note says which).",
" * Figures that a check found wrong are left out, as are minor-league, spring-training and",
" * college figures, which are not comparable with league numbers.",
" */",
"export interface ResearchSource {", "  title: string", "  publisher: string", "  url: string", "  published?: string", "}", "",
"export interface ResearchFact {", "  metric: MetricKey", "  value: number", "  quality: Quality", "  /** Date or season the figure applies to. */", "  asOf: string",
"  /** The researcher's reason for collecting it (fastest, explosive, strongest, arm, build, rising, hidden, bio). */", "  category: string", "  context: string",
"  /** The source's own rank wording, quoted. */", "  rank?: string", "  source: ResearchSource", "  confirmedBy?: ResearchSource", "  note: string", "}", "",
"export interface ResearchAthlete {", "  id: string", "  name: string", "  league: League", "  position: string", "  team: string", "  status: RosterStatus", "  era?: string", "  undrafted?: boolean", "  facts: ResearchFact[]", "}", "",
"export const RESEARCH_RETRIEVED = '2026-10-14'", "",
"export const RESEARCH: ResearchAthlete[] = " + to_ts(athletes, 0) ]
ts = '\n'.join(lines) + '\n'
# Narrow string literals for the typed fields.
open(OUT, 'w').write(ts)
print(json.dumps(stats), len(athletes), 'athletes', file=sys.stderr)
