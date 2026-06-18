import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Participant } from '../lib/supabase'
import { useRealtime } from '../hooks/useRealtime'
import { calcPoints } from '../lib/scoring'
import { getApiCacheSnapshot } from '../lib/matchApi'
import type { ApiMatch } from '../lib/matchApi'
import { normalizeTeamName } from '../constants/teamMapping'

interface ParticipantRow extends Participant {
  tentativePoints: number
  totalWithTentative: number
  exactScores: number
}

function normTeam(s: string): string {
  return normalizeTeamName(s)
    .toLowerCase()
    .replace(/&/g, 'and')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Construye un mapa match_id → { hs, as } para puntos finales y tentativos.
// Combina la BD (autoridad) con el cache del API (para partidos no sincronizados aún).
function buildScoreMaps(
  dbMatches: { id: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string }[],
  apiCache: ApiMatch[]
): {
  finished: Map<string, { hs: number; as: number }>
  live: Map<string, { hs: number; as: number }>
} {
  const finished = new Map<string, { hs: number; as: number }>()
  const live = new Map<string, { hs: number; as: number }>()

  // 1. BD es autoridad para partidos marcados como terminados/en vivo
  for (const m of dbMatches) {
    if (m.home_score === null || m.away_score === null) continue
    if (m.status === 'finished') finished.set(m.id, { hs: m.home_score, as: m.away_score })
    else if (m.status === 'live') live.set(m.id, { hs: m.home_score, as: m.away_score })
  }

  // 2. Para partidos aún en 'scheduled' en BD, intentar obtener scores del cache del API
  //    (por si el admin no ha sincronizado aún)
  const apiFinished = apiCache.filter(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null)
  const apiLive     = apiCache.filter(m => m.status === 'live'     && m.home_score !== null && m.away_score !== null)

  for (const dbm of dbMatches) {
    if (finished.has(dbm.id) || live.has(dbm.id)) continue   // ya cubierto por la BD

    const dH = normTeam(dbm.home_team)
    const dA = normTeam(dbm.away_team)

    const tryOverlay = (source: ApiMatch[], target: Map<string, { hs: number; as: number }>) => {
      for (const api of source) {
        const aH = normTeam(api.home_team)
        const aA = normTeam(api.away_team)
        if (dH === aH && dA === aA) {
          target.set(dbm.id, { hs: api.home_score!, as: api.away_score! })
          return
        }
        // Equipos invertidos entre Excel y API — también hay que invertir los goles
        if (dH === aA && dA === aH) {
          target.set(dbm.id, { hs: api.away_score!, as: api.home_score! })
          return
        }
      }
    }

    tryOverlay(apiFinished, finished)
    if (!finished.has(dbm.id)) tryOverlay(apiLive, live)
  }

  return { finished, live }
}

async function fetchRankingData(): Promise<{ rows: ParticipantRow[]; hasLive: boolean }> {
  const [
    { data: participants },
    { data: allMatches },
    { data: allPreds },
  ] = await Promise.all([
    supabase.from('participants').select('*'),
    supabase.from('matches').select('id, home_team, away_team, home_score, away_score, status'),
    supabase.from('predictions').select('participant_id, match_id, predicted_home, predicted_away'),
  ])

  const preds   = allPreds   ?? []
  const matches = allMatches ?? []

  // Cache del API (sin llamada de red — lo que ya está en localStorage)
  const apiCache = getApiCacheSnapshot()?.data ?? []

  const { finished: finishedScores, live: liveScores } = buildScoreMaps(matches, apiCache)

  // Calcular puntos enteramente del lado del cliente
  const totalMap:     Record<string, number> = {}
  const exactMap:     Record<string, number> = {}
  const tentativeMap: Record<string, number> = {}

  for (const pred of preds) {
    const f = finishedScores.get(pred.match_id)
    if (f) {
      const pts = calcPoints(
        { predicted_home: Number(pred.predicted_home), predicted_away: Number(pred.predicted_away) },
        { home_score: f.hs, away_score: f.as }
      )
      totalMap[pred.participant_id] = (totalMap[pred.participant_id] ?? 0) + pts
      if (pts === 3) exactMap[pred.participant_id] = (exactMap[pred.participant_id] ?? 0) + 1
    }

    const l = liveScores.get(pred.match_id)
    if (l) {
      const pts = calcPoints(
        { predicted_home: Number(pred.predicted_home), predicted_away: Number(pred.predicted_away) },
        { home_score: l.hs, away_score: l.as }
      )
      tentativeMap[pred.participant_id] = (tentativeMap[pred.participant_id] ?? 0) + pts
    }
  }

  const rows: ParticipantRow[] = (participants ?? []).map(p => {
    const total     = totalMap[p.id]     ?? 0
    const tentative = tentativeMap[p.id] ?? 0
    return {
      ...p,
      total_points: total,
      tentativePoints: tentative,
      totalWithTentative: total + tentative,
      exactScores: exactMap[p.id] ?? 0,
    }
  })

  rows.sort((a, b) =>
    b.totalWithTentative - a.totalWithTentative ||
    b.exactScores - a.exactScores
  )

  return { rows, hasLive: liveScores.size > 0 }
}

const MEDALS    = ['🥇', '🥈', '🥉']
const ROW_CLASS = ['rank-gold', 'rank-silver', 'rank-bronze']
const NAME_CLASS    = ['text-yellow-400 font-bold', 'text-slate-200 font-semibold', 'text-amber-500 font-semibold']
const AVATAR_CLASS  = [
  'bg-gradient-to-br from-yellow-400 to-amber-500 text-[#060e1a]',
  'bg-gradient-to-br from-slate-300 to-slate-400 text-[#060e1a]',
  'bg-gradient-to-br from-amber-700 to-amber-800 text-white',
]
const POINTS_CLASS  = ['text-yellow-400', 'text-slate-200', 'text-amber-500']

export function RankingTable() {
  useRealtime()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['participants'],
    queryFn: fetchRankingData,
    refetchInterval: 30_000,
  })

  const rows    = data?.rows    ?? []
  const hasLive = data?.hasLive ?? false

  if (isLoading) return <RankingSkeleton />
  if (error) return (
    <div className="card p-6 border-red-500/30 text-center text-red-400">
      ⚠️ No se pudo cargar el ranking.
    </div>
  )

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="text-2xl">🏆</span>
        <div>
          <h2 className="font-display text-xl tracking-widest text-yellow-400 leading-none">TABLA DE POSICIONES</h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
            {rows.length} participantes
            {hasLive && (
              <span className="ml-2 text-red-400 font-semibold">
                · <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-1 align-middle" />
                puntos en vivo
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-[3rem_1fr_3rem_auto] px-3 py-2 border-b border-white/5">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider text-center">#</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider pl-2">Jugador</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider text-center" title="Marcadores exactos">🎯</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider pr-3">Pts</span>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {rows.map((p, i) => (
          <div
            key={p.id}
            onClick={() => navigate(`/jugador/${encodeURIComponent(p.name)}`)}
            className={`grid grid-cols-[3rem_1fr_3rem_auto] items-center cursor-pointer transition-all duration-150 hover:bg-white/5 ${ROW_CLASS[i] ?? ''}`}
          >
            <div className="py-3.5 text-center">
              {i < 3
                ? <span className="text-xl leading-none">{MEDALS[i]}</span>
                : <span className="text-slate-600 font-mono text-sm">{i + 1}</span>
              }
            </div>

            <div className="py-3.5 pl-2 pr-3 flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${AVATAR_CLASS[i] ?? 'bg-white/8 text-slate-300'}`}>
                {p.name[0]?.toUpperCase()}
              </div>
              <span className={`truncate text-sm ${NAME_CLASS[i] ?? 'text-slate-300'}`}>
                {p.name}
              </span>
            </div>

            <div className="py-3.5 text-center">
              {p.exactScores > 0
                ? <span className="text-sm font-semibold text-emerald-400 tabular-nums">{p.exactScores}</span>
                : <span className="text-slate-700 text-xs">—</span>
              }
            </div>

            <div className="py-3.5 pr-4 text-right flex items-baseline justify-end gap-1.5">
              <span className={`font-display text-2xl leading-none ${POINTS_CLASS[i] ?? 'text-slate-400'}`}>
                {p.total_points}
              </span>
              {p.tentativePoints > 0 && (
                <span className="text-xs font-bold text-red-400 bg-red-400/10 border border-red-400/25 rounded px-1 py-0.5 leading-none animate-pulse">
                  +{p.tentativePoints}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="py-16 text-center text-slate-600">
          <p className="text-4xl mb-3">⚽</p>
          <p className="text-sm">Subí el Excel desde el panel admin<br />para ver el ranking.</p>
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
        <span>🎯 Marcadores exactos · desempate si hay igualdad de puntos</span>
        {hasLive && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span>Puntos <span className="text-red-400 font-semibold">+N</span> tentativos según marcador actual</span>
          </span>
        )}
      </div>
    </div>
  )
}

function RankingSkeleton() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="px-5 py-4 border-b border-white/5 h-16 flex items-center gap-3">
        <div className="w-8 h-8 bg-white/10 rounded-full" />
        <div className="h-5 bg-white/10 rounded w-40" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[3rem_1fr_3rem_auto] items-center px-3 py-3.5 border-b border-white/5 gap-3">
          <div className="h-5 w-5 bg-white/8 rounded mx-auto" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/8 rounded-full shrink-0" />
            <div className="h-4 bg-white/8 rounded flex-1" />
          </div>
          <div className="h-4 w-5 bg-white/8 rounded mx-auto" />
          <div className="h-7 w-8 bg-white/8 rounded mr-2" />
        </div>
      ))}
    </div>
  )
}
