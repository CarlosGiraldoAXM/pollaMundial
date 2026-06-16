import type { ApiMatch } from './matchApi'

const OFB_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Cache de localStorage para la pestaña de Grupos
const OFB_LS_KEY = 'polla_ofb_matches_v1'
const OFB_LS_TTL = 2 * 60 * 60 * 1000

interface OFBLsCache { data: ApiMatch[]; ts: number }

function ofbLsRead(): OFBLsCache | null {
  try {
    const raw = localStorage.getItem(OFB_LS_KEY)
    return raw ? JSON.parse(raw) as OFBLsCache : null
  } catch { return null }
}

function ofbLsWrite(data: ApiMatch[]) {
  try {
    localStorage.setItem(OFB_LS_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

export function getOFBCacheSnapshot(): { data: ApiMatch[]; ts: number } | null {
  return ofbLsRead()
}

interface OFBGoal {
  name: string
  minute: string
}

interface OFBMatch {
  date: string    // "2026-06-11"
  time?: string   // "13:00 UTC-6"  ← plain strings, offset incluido
  team1: string   // "Mexico"        ← string directo, NO objeto
  team2: string   // "South Africa"
  score?: { ft: [number, number]; ht?: [number, number] }
  goals1?: OFBGoal[]
  goals2?: OFBGoal[]
}

interface OFBData {
  matches?: OFBMatch[]
  rounds?: { matches: OFBMatch[] }[]
}

export interface OFBResult {
  team1: string
  team2: string
  homeScore: number
  awayScore: number
  date: string
}

function norm(name: string): string {
  return name.trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function pairKey(a: string, b: string): string {
  return [norm(a), norm(b)].sort().join('::')
}

// "13:00 UTC-6" → "11 jun · 14:00"  (Colombia = UTC-5)
function toColombiaTime(date: string, time: string): string | null {
  // Captura hora, minuto y offset (ej: UTC-6 → offset=-6)
  const m = time.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d+)$/)
  if (!m) return null

  const localHour  = parseInt(m[1])
  const localMin   = parseInt(m[2])
  const utcOffset  = parseInt(m[3])   // -6 = UTC-6

  // Convertir a UTC: UTC = hora_local - offset
  const utcMinutes = localHour * 60 + localMin - utcOffset * 60
  // Colombia es UTC-5
  const colMinutes = utcMinutes - 5 * 60

  // Normalizar al rango [0, 24h)
  const wrapped  = ((colMinutes % 1440) + 1440) % 1440
  const colHour  = Math.floor(wrapped / 60)
  const colMin   = wrapped % 60

  // Ajustar el día si el wrap cruzó medianoche
  const [, monthStr, dayStr] = date.split('-')
  let day = parseInt(dayStr)
  if (colMinutes < 0)    day--
  if (colMinutes >= 1440) day++

  return `${day} ${MONTHS[parseInt(monthStr) - 1]} · ${String(colHour).padStart(2, '0')}:${String(colMin).padStart(2, '0')}`
}

// Cache en memoria del JSON crudo — evita doble fetch si fetchOFBSchedule y fetchOFBMatches
// se invocan juntos al arrancar la app
let rawMemCache: { data: OFBMatch[]; ts: number } | null = null

async function fetchOFBData(): Promise<OFBMatch[]> {
  if (rawMemCache && Date.now() - rawMemCache.ts < 60_000) return rawMemCache.data
  const res = await fetch(OFB_URL)
  if (!res.ok) throw new Error(`openfootball HTTP ${res.status}`)
  const data: OFBData = await res.json()
  const all: OFBMatch[] = []
  if (data.matches) all.push(...data.matches)
  else if (data.rounds) data.rounds.forEach(r => all.push(...(r.matches ?? [])))
  rawMemCache = { data: all, ts: Date.now() }
  return all
}

function goalsToStr(goals: OFBGoal[] | undefined): string | null {
  if (!goals?.length) return null
  // Convierte [{name, minute}] al formato PostgreSQL que espera scorers.ts: {"Name 45'"}
  return '{' + goals.map(g => `"${g.name} ${g.minute}'"`).join(',') + '}'
}

// Retorna todos los partidos del JSON como ApiMatch[], con cache en localStorage (2h)
export async function fetchOFBMatches(forceRefresh = false): Promise<ApiMatch[]> {
  if (!forceRefresh) {
    const cached = ofbLsRead()
    if (cached && Date.now() - cached.ts < OFB_LS_TTL) return cached.data
  }
  if (forceRefresh) rawMemCache = null   // forzar re-fetch del JSON crudo también

  const all = await fetchOFBData()

  const matches: ApiMatch[] = all
    .filter(m => m.team1 && m.team2)
    .map((m): ApiMatch => ({
      id: `ofb::${m.date}::${norm(m.team1)}::${norm(m.team2)}`,
      home_team: m.team1,
      away_team: m.team2,
      home_score: m.score?.ft[0] ?? null,
      away_score: m.score?.ft[1] ?? null,
      status: m.score?.ft ? 'finished' : 'scheduled',
      date: m.date ?? null,
      group: m.group ? m.group.replace(/^Group\s+/i, '') : null,
      type: m.group ? 'group' : null,
      home_scorers: goalsToStr(m.goals1),
      away_scorers: goalsToStr(m.goals2),
    }))

  if (matches.length > 0) ofbLsWrite(matches)
  return matches
}

// Retorna Map<"TEAM1::TEAM2" (sorted, normalizado) → "11 jun · 14:00">
export async function fetchOFBSchedule(): Promise<Map<string, string>> {
  const all = await fetchOFBData()
  const schedule = new Map<string, string>()
  for (const m of all) {
    if (!m.date || !m.time || !m.team1 || !m.team2) continue
    const colTime = toColombiaTime(m.date, m.time)
    if (colTime) schedule.set(pairKey(m.team1, m.team2), colTime)
  }
  return schedule
}

// Retorna solo los partidos que ya tienen resultado final (score.ft)
export async function fetchOFBResults(): Promise<OFBResult[]> {
  const all = await fetchOFBData()
  return all
    .filter(m => m.score?.ft)
    .map(m => ({
      team1: m.team1,
      team2: m.team2,
      homeScore: m.score!.ft[0],
      awayScore: m.score!.ft[1],
      date: m.date,
    }))
}
