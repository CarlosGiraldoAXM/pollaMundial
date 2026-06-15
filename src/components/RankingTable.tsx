import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Participant } from '../lib/supabase'
import { useRealtime } from '../hooks/useRealtime'
import { calcPoints } from '../lib/scoring'

interface ParticipantRow extends Participant {
  tentativePoints: number
  totalWithTentative: number
}

async function fetchRankingData(): Promise<{ rows: ParticipantRow[]; hasLive: boolean }> {
  const [
    { data: participants },
    { data: liveMatches },
    { data: allPreds },
  ] = await Promise.all([
    supabase.from('participants').select('*').order('total_points', { ascending: false }),
    supabase.from('matches').select('id, home_score, away_score').eq('status', 'live'),
    supabase.from('predictions').select('participant_id, match_id, predicted_home, predicted_away'),
  ])

  const live = liveMatches ?? []
  const preds = allPreds ?? []
  const liveIds = new Set(live.map(m => m.id))

  // Puntos tentativos por participante (sumando todos los partidos en vivo)
  const tentativeMap: Record<string, number> = {}
  for (const lm of live) {
    if (lm.home_score === null || lm.away_score === null) continue
    for (const pred of preds.filter(p => liveIds.has(p.match_id) && p.match_id === lm.id)) {
      const pts = calcPoints(
        { predicted_home: pred.predicted_home, predicted_away: pred.predicted_away },
        { home_score: lm.home_score!, away_score: lm.away_score! }
      )
      tentativeMap[pred.participant_id] = (tentativeMap[pred.participant_id] ?? 0) + pts
    }
  }

  const rows: ParticipantRow[] = (participants ?? []).map(p => ({
    ...p,
    tentativePoints: tentativeMap[p.id] ?? 0,
    totalWithTentative: p.total_points + (tentativeMap[p.id] ?? 0),
  }))

  // Con partidos en vivo, reordenar por puntos reales + tentativos
  if (live.length > 0) {
    rows.sort((a, b) => b.totalWithTentative - a.totalWithTentative)
  }

  return { rows, hasLive: live.length > 0 }
}

const MEDALS = ['🥇', '🥈', '🥉']
const ROW_CLASS = ['rank-gold', 'rank-silver', 'rank-bronze']
const NAME_CLASS = ['text-yellow-400 font-bold', 'text-slate-200 font-semibold', 'text-amber-500 font-semibold']
const AVATAR_CLASS = [
  'bg-gradient-to-br from-yellow-400 to-amber-500 text-[#060e1a]',
  'bg-gradient-to-br from-slate-300 to-slate-400 text-[#060e1a]',
  'bg-gradient-to-br from-amber-700 to-amber-800 text-white',
]
const POINTS_CLASS = ['text-yellow-400', 'text-slate-200', 'text-amber-500']

export function RankingTable() {
  useRealtime()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['participants'],
    queryFn: fetchRankingData,
    refetchInterval: 30_000,
  })

  const rows = data?.rows ?? []
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
      <div className="grid grid-cols-[3rem_1fr_auto] px-3 py-2 border-b border-white/5">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider text-center">#</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider pl-2">Jugador</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider pr-3">Pts</span>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {rows.map((p, i) => (
          <div
            key={p.id}
            onClick={() => navigate(`/jugador/${encodeURIComponent(p.name)}`)}
            className={`grid grid-cols-[3rem_1fr_auto] items-center cursor-pointer transition-all duration-150 hover:bg-white/5 ${ROW_CLASS[i] ?? ''}`}
          >
            {/* Rank */}
            <div className="py-3.5 text-center">
              {i < 3
                ? <span className="text-xl leading-none">{MEDALS[i]}</span>
                : <span className="text-slate-600 font-mono text-sm">{i + 1}</span>
              }
            </div>

            {/* Name + avatar */}
            <div className="py-3.5 pl-2 pr-3 flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${AVATAR_CLASS[i] ?? 'bg-white/8 text-slate-300'}`}>
                {p.name[0]?.toUpperCase()}
              </div>
              <span className={`truncate text-sm ${NAME_CLASS[i] ?? 'text-slate-300'}`}>
                {p.name}
              </span>
            </div>

            {/* Points: real + tentativo */}
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

      {hasLive && (
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          Los puntos <span className="text-red-400 font-semibold mx-0.5">+N</span> son tentativos según el marcador actual
        </div>
      )}
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
        <div key={i} className="grid grid-cols-[3rem_1fr_auto] items-center px-3 py-3.5 border-b border-white/5 gap-3">
          <div className="h-5 w-5 bg-white/8 rounded mx-auto" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/8 rounded-full shrink-0" />
            <div className="h-4 bg-white/8 rounded flex-1" />
          </div>
          <div className="h-7 w-8 bg-white/8 rounded mr-2" />
        </div>
      ))}
    </div>
  )
}
