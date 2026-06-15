import type { ApiMatch } from './matchApi'

export interface TeamStanding {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

export interface GroupStanding {
  group: string
  teams: TeamStanding[]
}

// The API's `group` field for actual group stage matches is always a single letter A-L.
// Knockout rounds use "R32", "R16", "QF", "SF", "F" — those are excluded here.
const GROUP_LETTERS = new Set('ABCDEFGHIJKL'.split(''))

export function computeGroupStandings(matches: ApiMatch[]): GroupStanding[] {
  const stats: Record<string, Record<string, TeamStanding>> = {}

  for (const m of matches) {
    if (!m.group || !GROUP_LETTERS.has(m.group)) continue

    const g = m.group
    if (!stats[g]) stats[g] = {}

    for (const team of [m.home_team, m.away_team]) {
      if (!stats[g][team]) {
        stats[g][team] = { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }
      }
    }

    if (m.status !== 'finished') continue
    if (m.home_score === null || m.away_score === null) continue

    const h = stats[g][m.home_team]
    const a = stats[g][m.away_team]

    h.played++; a.played++
    h.gf += m.home_score; h.ga += m.away_score
    a.gf += m.away_score; a.ga += m.home_score

    if (m.home_score > m.away_score) {
      h.won++; a.lost++; h.points += 3
    } else if (m.home_score < m.away_score) {
      a.won++; h.lost++; a.points += 3
    } else {
      h.drawn++; a.drawn++; h.points++; a.points++
    }

    h.gd = h.gf - h.ga
    a.gd = a.gf - a.ga
  }

  return Object.entries(stats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, teamMap]) => {
      const teams = Object.values(teamMap)
      teams.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.gd !== a.gd) return b.gd - a.gd
        if (b.gf !== a.gf) return b.gf - a.gf
        return a.team.localeCompare(b.team)
      })
      return { group, teams }
    })
}
