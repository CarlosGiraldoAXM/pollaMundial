const API_URL = 'https://worldcup26.ir/get/games'

// Versión del cache — incrementar si cambia el shape de ApiMatch
const LS_KEY = 'polla_api_matches_v1'
// Datos frescos durante 2 horas; un partido dura ~110 min
const LS_TTL = 2 * 60 * 60 * 1000

export interface ApiMatch {
  id: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'live' | 'finished'
  date: string | null
  group: string | null        // "A"–"L" en fase de grupos; "R32", "QF", "SF", "F" en eliminatorias
  type: string | null         // "group", "r32", "r16", "qf", "sf", "f"
  home_scorers: string | null // formato PostgreSQL: {\"Nombre 45'\",\"Nombre 67'\"} o "null"
  away_scorers: string | null
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
  group?: string
  type?: string
  home_scorers?: string | null
  away_scorers?: string | null
  [key: string]: unknown
}

interface LsCache { data: ApiMatch[]; ts: number }

function lsRead(): LsCache | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as LsCache) : null
  } catch {
    return null
  }
}

/** Para que el componente pueda pre-cargar datos del cache sin esperar la query */
export function getApiCacheSnapshot(): { data: ApiMatch[]; ts: number } | null {
  return lsRead()
}

function lsWrite(data: ApiMatch[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // localStorage lleno o no disponible — ignorar
  }
}

// Cache en memoria para la sesión actual
let memCache: ApiMatch[] = []

/**
 * forceRefresh = true → ignora el cache de localStorage y llama la API directamente.
 * Usar solo desde el panel admin ("Actualizar desde API").
 */
export async function fetchAllMatches(forceRefresh = false): Promise<ApiMatch[]> {
  // 1. Cache de localStorage — retorna inmediatamente si los datos son frescos
  if (!forceRefresh) {
    const cached = lsRead()
    if (cached && Date.now() - cached.ts < LS_TTL) {
      memCache = cached.data
      return cached.data
    }
  }

  // 2. Intentar la API
  const controller = new AbortController()
  // La API worldcup26.ir puede tardar 20-30s en responder (JSON grande)
  const timeout = setTimeout(() => controller.abort(), 40_000)

  let res: Response
  try {
    res = await fetch(API_URL, { signal: controller.signal })
  } catch {
    clearTimeout(timeout)
    // API caída — devolver lo que haya en localStorage (aunque sea viejo) o memCache
    const stale = lsRead()
    if (stale) {
      console.warn('API caída — usando cache de localStorage')
      memCache = stale.data
      return stale.data
    }
    if (memCache.length) {
      console.warn('API caída — usando cache en memoria')
      return memCache
    }
    throw new Error('No se pudo conectar con la API de resultados')
  }
  clearTimeout(timeout)

  if (!res.ok) {
    // HTTP error (ej: 500, 403) — no borrar cache, retornar lo que haya
    const stale = lsRead()
    if (stale) {
      console.warn(`API HTTP ${res.status} — usando cache de localStorage`)
      memCache = stale.data
      return stale.data
    }
    if (memCache.length) return memCache
    throw new Error(`API error: ${res.status}`)
  }

  const json = await res.json()

  const raw: RawMatch[] = Array.isArray(json)
    ? json
    : json.games ?? json.matches ?? json.data ?? []

  const fresh = raw.map(m => ({
    id: String(m.id ?? m._id ?? ''),
    home_team: String(m.home_team_name_en ?? '').trim(),
    away_team: String(m.away_team_name_en ?? '').trim(),
    home_score: parseScore(m.home_score),
    away_score: parseScore(m.away_score),
    status: deriveStatus(m),
    date: m.local_date ? String(m.local_date) : null,
    group: m.group ? String(m.group) : null,
    type: m.type ? String(m.type) : null,
    home_scorers: m.home_scorers != null ? String(m.home_scorers) : null,
    away_scorers: m.away_scorers != null ? String(m.away_scorers) : null,
  })).filter(m => m.home_team && m.away_team)

  // Solo actualizar cache si la respuesta tiene datos válidos
  // (evita borrar cache con una respuesta vacía/malformada de la API)
  if (fresh.length > 0) {
    memCache = fresh
    lsWrite(memCache)
  }
  return memCache.length ? memCache : fresh
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
  // Cualquier time_elapsed no vacío y no "notstarted" = partido en curso
  // (incluye: "45", "HT", "90+2", "live", etc.)
  if (!elapsed || elapsed === 'notstarted') return 'scheduled'
  return 'live'
}
