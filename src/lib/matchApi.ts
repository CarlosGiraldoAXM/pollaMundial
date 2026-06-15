const API_URL = 'https://worldcup26.ir/get/games'

export interface ApiMatch {
  id: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'live' | 'finished'
  date: string | null
}

interface RawMatch {
  id?: string
  _id?: string
  home_team_name_en?: string
  away_team_name_en?: string
  home_score?: string | number | null
  away_score?: string | number | null
  finished?: string | boolean
  time_elapsed?: string
  local_date?: string
  [key: string]: unknown
}

// Cache en memoria para no dejar la UI sin datos si la API tarda
let lastSuccessfulResult: ApiMatch[] = []

export async function fetchAllMatches(): Promise<ApiMatch[]> {
  // Traza de quién llamó esta función — visible en consola del navegador
  console.trace('[matchApi] fetchAllMatches llamado')

  const controller = new AbortController()
  // La API worldcup26.ir puede tardar 20-30s en responder (JSON grande)
  const timeout = setTimeout(() => controller.abort(), 40_000)

  let res: Response
  try {
    res = await fetch(API_URL, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timeout)
    if (lastSuccessfulResult.length) {
      console.warn('API timeout — usando último resultado en caché')
      return lastSuccessfulResult
    }
    throw new Error('No se pudo conectar con la API de resultados')
  }
  clearTimeout(timeout)

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = await res.json()

  const raw: RawMatch[] = Array.isArray(json)
    ? json
    : json.games ?? json.matches ?? json.data ?? []

  lastSuccessfulResult = raw.map(m => ({
    id: String(m.id ?? m._id ?? ''),
    home_team: String(m.home_team_name_en ?? '').trim(),
    away_team: String(m.away_team_name_en ?? '').trim(),
    home_score: parseScore(m.home_score),
    away_score: parseScore(m.away_score),
    status: deriveStatus(m),
    date: m.local_date ? String(m.local_date) : null,
  })).filter(m => m.home_team && m.away_team)
  return lastSuccessfulResult
}

function parseScore(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === '' || val === 'null') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function deriveStatus(m: RawMatch): 'scheduled' | 'live' | 'finished' {
  const elapsed = String(m.time_elapsed ?? '').toLowerCase().trim()
  if (elapsed === 'finished') return 'finished'
  if (String(m.finished ?? '').toUpperCase() === 'TRUE') return 'finished'
  if (elapsed === 'live') return 'live'
  // Todo lo demás (notstarted, "0", vacío, desconocido) = programado
  return 'scheduled'
}
