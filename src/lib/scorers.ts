import type { ApiMatch } from './matchApi'

export interface TopScorer {
  name: string
  team: string
  goals: number
  penalties: number
}

interface GoalEntry {
  name: string
  isOwnGoal: boolean
  isPenalty: boolean
}

// Parses the PostgreSQL-style array string the API returns:
// '{"Nombre 45\'","Nombre 90\'+5\' (p)"}' → GoalEntry[]
function parseScorers(raw: string | null | undefined): GoalEntry[] {
  if (!raw || raw === 'null') return []

  const inner = raw.replace(/^\{([\s\S]*)\}$/, '$1').trim()
  if (!inner) return []

  const entries: GoalEntry[] = []
  const quoted = /"([^"]+)"/g
  let m
  while ((m = quoted.exec(inner)) !== null) {
    const entry = m[1]
    const isOwnGoal = /\(OG\)/i.test(entry)
    const isPenalty = /\(\s*p\s*\)/i.test(entry)

    // Name = everything before the first standalone digit (the minute)
    const nameMatch = entry.match(/^(.+?)\s+\d/)
    const name = nameMatch ? nameMatch[1].trim() : entry.replace(/\s+\d.*$/, '').trim()

    entries.push({ name, isOwnGoal, isPenalty })
  }

  return entries
}

export function computeTopScorers(matches: ApiMatch[]): TopScorer[] {
  const map = new Map<string, TopScorer>()

  const addGoals = (raw: string | null, team: string) => {
    for (const goal of parseScorers(raw)) {
      if (goal.isOwnGoal) continue
      const key = `${goal.name}::${team}`
      if (!map.has(key)) map.set(key, { name: goal.name, team, goals: 0, penalties: 0 })
      const s = map.get(key)!
      s.goals++
      if (goal.isPenalty) s.penalties++
    }
  }

  for (const m of matches) {
    if (m.home_team) addGoals(m.home_scorers, m.home_team)
    if (m.away_team) addGoals(m.away_scorers, m.away_team)
  }

  return [...map.values()]
    .filter(s => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
}
