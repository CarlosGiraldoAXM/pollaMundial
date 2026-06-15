import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match } from '../lib/supabase'
import { MatchCard } from './MatchCard'
import { calcPoints } from '../lib/scoring'

interface MatchWithStats extends Match {
  correctExact: number
  correctWinner: number
  total: number
}

async function fetchMatchesWithStats(): Promise<MatchWithStats[]> {
  const [{ data: matches }, { data: preds }] = await Promise.all([
    supabase.from('matches').select('*').order('match_order', { ascending: true }),
    supabase.from('predictions').select('match_id, predicted_home, predicted_away'),
  ])

  return (matches ?? []).map(m => {
    const matchPreds = (preds ?? []).filter(p => p.match_id === m.id)
    let exactCount = 0
    let winnerCount = 0

    if (m.home_score !== null && m.away_score !== null) {
      for (const p of matchPreds) {
        const pts = calcPoints(
          { predicted_home: p.predicted_home, predicted_away: p.predicted_away },
          { home_score: m.home_score!, away_score: m.away_score! }
        )
        if (pts === 3) exactCount++
        else if (pts === 1) winnerCount++
      }
    }

    return { ...m, correctExact: exactCount, correctWinner: winnerCount, total: matchPreds.length }
  })
}

const PHASES = [
  { key: 'all', label: 'Todos' },
  { key: 'PRIMERA_FECHA', label: 'Fecha 1' },
  { key: 'SEGUNDA_FECHA', label: 'Fecha 2' },
  { key: 'TERCERA_FECHA', label: 'Fecha 3' },
  { key: 'DIECISEISAVOS', label: '1/16' },
  { key: 'OCTAVOS', label: 'Octavos' },
  { key: 'CUARTOS', label: 'Cuartos' },
  { key: 'SEMIFINALES', label: 'Semis' },
  { key: 'FINAL', label: 'Final' },
]

export function MatchList() {
  const [phase, setPhase] = useState('all')

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: fetchMatchesWithStats,
    refetchInterval: 60_000,
  })

  const STATUS_ORDER = { live: 0, scheduled: 1, finished: 2 }

  const filtered = (phase === 'all' ? matches : matches.filter(m => m.phase === phase))
    .sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 1
      const sb = STATUS_ORDER[b.status] ?? 1
      if (sa !== sb) return sa - sb          // live primero, finished último
      return (a.match_order ?? 0) - (b.match_order ?? 0) // dentro del mismo estado, orden Excel
    })
  const liveCount = matches.filter(m => m.status === 'live').length

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">⚽</span>
          <div>
            <h2 className="font-display text-xl tracking-widest text-yellow-400 leading-none">PARTIDOS</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
              {matches.length} partidos
              {liveCount > 0 && <span className="ml-2 text-red-400 font-semibold">· {liveCount} en vivo</span>}
            </p>
          </div>
        </div>

        {/* Phase filter */}
        <div className="flex flex-wrap gap-1.5">
          {PHASES.map(p => (
            <button
              key={p.key}
              onClick={() => setPhase(p.key)}
              className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-all duration-150 ${
                phase === p.key
                  ? 'bg-yellow-400 text-[#060e1a] font-bold border-yellow-400 shadow-[0_0_12px_rgba(245,197,24,0.3)]'
                  : 'border-white/10 text-slate-500 hover:border-yellow-400/30 hover:text-yellow-400/80'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Match cards - single column for readable team names */}
      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white/4 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin">
          {filtered.map(m => (
            <MatchCard
              key={m.id}
              match={m}
              correctExact={m.correctExact}
              correctWinner={m.correctWinner}
              totalPredictions={m.total}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-600">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm">No hay partidos en esta fase todavía.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
