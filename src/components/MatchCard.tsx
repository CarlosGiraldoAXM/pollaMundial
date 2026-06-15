import type { Match } from '../lib/supabase'
import { getFlagUrl } from '../constants/flagEmoji'

function FlagImg({ team, className = '' }: { team: string; className?: string }) {
  const url = getFlagUrl(team)
  if (!url) return <span className={`text-slate-600 text-xs font-bold ${className}`}>{team.slice(0, 3)}</span>
  return (
    <img
      src={url}
      alt={team}
      className={`object-cover rounded-sm shrink-0 ${className}`}
      style={{ width: 28, height: 20 }}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

interface Props {
  match: Match
  correctExact?: number
  correctWinner?: number
  totalPredictions?: number
}

const PHASE_LABELS: Record<string, string> = {
  PRIMERA_FECHA: 'Fecha 1 · Grupos',
  SEGUNDA_FECHA: 'Fecha 2 · Grupos',
  TERCERA_FECHA: 'Fecha 3 · Grupos',
  DIECISEISAVOS: 'Dieciseisavos',
  OCTAVOS: 'Octavos de Final',
  CUARTOS: 'Cuartos de Final',
  SEMIFINALES: 'Semifinales',
  FINAL: 'Gran Final',
}

export function MatchCard({ match, correctExact = 0, correctWinner = 0, totalPredictions = 0 }: Props) {
  const isFinished = match.status === 'finished'
  const isLive = match.status === 'live'
  const hasScore = match.home_score !== null && match.away_score !== null

  return (
    <div className="card-match p-4">
      {/* Phase + status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          {PHASE_LABELS[match.phase] ?? match.phase}
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full border border-red-400/25">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
            EN VIVO
          </span>
        )}
        {isFinished && (
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20">
            Finalizado
          </span>
        )}
        {!isLive && !isFinished && (
          <span className="text-[10px] text-slate-600 bg-white/3 px-2.5 py-1 rounded-full border border-white/5">
            Programado
          </span>
        )}
      </div>

      {/* Teams + Score */}
      <div className="flex items-center gap-3">
        {/* Home */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <FlagImg team={match.home_team} />
          <span className="font-semibold text-white text-sm leading-snug">{match.home_team}</span>
        </div>

        {/* Score */}
        <div className="shrink-0 text-center min-w-[64px]">
          {hasScore ? (
            <div className="font-display tracking-wider leading-none">
              <span className={`text-3xl tabular-nums ${isFinished ? 'text-yellow-400' : 'text-white'}`}>
                {match.home_score}
              </span>
              <span className="text-slate-600 text-xl mx-1">–</span>
              <span className={`text-3xl tabular-nums ${isFinished ? 'text-yellow-400' : 'text-white'}`}>
                {match.away_score}
              </span>
            </div>
          ) : (
            <span className="text-slate-600 font-semibold text-sm">VS</span>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="font-semibold text-white text-sm leading-snug text-right">{match.away_team}</span>
          <FlagImg team={match.away_team} />
        </div>
      </div>

      {/* Stats */}
      {isFinished && totalPredictions > 0 && (
        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-emerald-400 font-bold">{correctExact}</span>
            <span className="text-slate-500">exactos</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            <span className="text-blue-400 font-bold">{correctWinner}</span>
            <span className="text-slate-500">ganador</span>
          </span>
          <span className="ml-auto text-slate-600">/{totalPredictions}</span>
        </div>
      )}
    </div>
  )
}
