import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Participant, Match, Prediction } from '../lib/supabase'
import { getFlagUrl } from '../constants/flagEmoji'
import { calcPoints } from '../lib/scoring'
import { getApiCacheSnapshot } from '../lib/matchApi'
import type { ApiMatch } from '../lib/matchApi'
import { normalizeTeamName } from '../constants/teamMapping'

interface PredictionRow {
  prediction: Prediction
  match: Match
}

function normTeam(s: string): string {
  return normalizeTeamName(s)
    .toLowerCase()
    .replace(/&/g, 'and')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

async function fetchPlayerData(name: string): Promise<{ participant: Participant; rows: PredictionRow[] } | null> {
  const { data: p } = await supabase
    .from('participants')
    .select('*')
    .eq('name', name)
    .single()
  if (!p) return null

  const { data: preds } = await supabase
    .from('predictions')
    .select('*')
    .eq('participant_id', p.id)

  const matchIds = [...new Set((preds ?? []).map(pr => pr.match_id))]
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .in('id', matchIds)

  const matchMap = new Map((matches ?? []).map(m => [m.id, m as Match]))

  const rows: PredictionRow[] = (preds ?? [])
    .map((pred: Prediction) => ({ prediction: pred, match: matchMap.get(pred.match_id)! }))
    .filter(r => r.match)
    .sort((a, b) => (a.match.match_order ?? 0) - (b.match.match_order ?? 0))

  return { participant: p, rows }
}

function FlagImg({ team }: { team: string }) {
  const url = getFlagUrl(team)
  if (!url) return null
  return (
    <img
      src={url}
      alt={team}
      className="rounded-sm shrink-0 object-cover"
      style={{ width: 22, height: 15 }}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

const POINTS_COLOR: Record<number, string> = {
  3: 'text-green-400 bg-green-400/10 border-green-400/30',
  1: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  0: 'text-slate-500 bg-white/5 border-white/10',
}

const POINTS_LABEL: Record<number, string> = {
  3: '✓ Exacto',
  1: '~ Ganador',
  0: '✗',
}

interface Props {
  name: string
}

export function PlayerDetail({ name }: Props) {
  // Hooks siempre al tope, antes de cualquier early return
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey: ['player', name],
    queryFn: () => fetchPlayerData(name),
  })

  // Overlay del cache del API para partidos no sincronizados a la BD aún
  // Misma lógica que buildScoreMaps en RankingTable para garantizar coherencia
  const rows = useMemo((): PredictionRow[] => {
    if (!data) return []
    const apiCache = getApiCacheSnapshot()?.data ?? []
    const apiFinished = apiCache.filter(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null)
    const apiLive     = apiCache.filter(m => m.status === 'live'     && m.home_score !== null && m.away_score !== null)

    return data.rows.map(({ prediction, match }) => {
      if (match.status === 'finished') return { prediction, match }
      const dH = normTeam(match.home_team)
      const dA = normTeam(match.away_team)

      const tryOverlay = (source: ApiMatch[]): Match | null => {
        for (const api of source) {
          const aH = normTeam(api.home_team)
          const aA = normTeam(api.away_team)
          if (dH === aH && dA === aA) {
            return { ...match, status: api.status as Match['status'], home_score: api.home_score, away_score: api.away_score }
          }
          if (dH === aA && dA === aH) {
            return { ...match, status: api.status as Match['status'], home_score: api.away_score, away_score: api.home_score }
          }
        }
        return null
      }

      const overlaid = tryOverlay(apiFinished) ?? tryOverlay(apiLive)
      return { prediction, match: overlaid ?? match }
    })
  }, [data])

  const toggle = (phase: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(phase) ? next.delete(phase) : next.add(phase)
      return next
    })

  if (isLoading) return <PlayerSkeleton />
  if (error || !data) {
    return (
      <div className="card p-8 text-center text-slate-400">
        <p className="text-4xl mb-3">👤</p>
        <p>No se encontró el jugador <strong className="text-white">{name}</strong>.</p>
      </div>
    )
  }

  const { participant } = data
  const grouped = groupByPhase(rows)

  // Calcular puntos del lado del cliente igual que RankingTable
  let totalPoints = 0
  let tentativePoints = 0
  let exactScores = 0
  for (const { prediction: pred, match } of rows) {
    if (match.home_score === null || match.away_score === null) continue
    const pts = calcPoints(
      { predicted_home: Number(pred.predicted_home), predicted_away: Number(pred.predicted_away) },
      { home_score: Number(match.home_score), away_score: Number(match.away_score) }
    )
    if (match.status === 'finished') {
      totalPoints += pts
      if (pts === 3) exactScores++
    } else if (match.status === 'live') {
      tentativePoints += pts
    }
  }

  return (
    <div className="space-y-4">
      {/* Player header */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-navy font-display text-2xl shrink-0">
          {participant.name[0]}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-display tracking-wider text-white truncate">{participant.name}</h1>
          <p className="text-slate-400 text-xs">Participante · Polla Gorettiana</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1.5">
            <p className="font-display text-4xl text-yellow-400 leading-none">{totalPoints}</p>
            {tentativePoints > 0 && (
              <span className="text-xs font-bold text-red-400 bg-red-400/10 border border-red-400/25 rounded px-1 py-0.5 leading-none animate-pulse">
                +{tentativePoints}
              </span>
            )}
          </div>
          <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-2">puntos</p>
          <p className="text-emerald-400 font-semibold text-sm leading-none">{exactScores} 🎯</p>
          <p className="text-slate-600 text-[10px] uppercase tracking-wider">exactos</p>
        </div>
      </div>

      {/* Predictions by phase */}
      {grouped.map(({ phase, rows: phaseRows }) => {
        const isCollapsed = collapsed.has(phase)

        let phasePoints = 0
        for (const { prediction: pred, match } of phaseRows) {
          if ((match.status === 'finished' || match.status === 'live') && match.home_score !== null && match.away_score !== null) {
            phasePoints += calcPoints(
              { predicted_home: Number(pred.predicted_home), predicted_away: Number(pred.predicted_away) },
              { home_score: Number(match.home_score), away_score: Number(match.away_score) }
            )
          }
        }
        const finishedCount = phaseRows.filter(r => r.match.status === 'finished' || r.match.status === 'live').length
        const total = phaseRows.length

        return (
          <div key={phase} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(phase)}
              onTouchEnd={e => { e.preventDefault(); toggle(phase); }}
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              className="w-full px-4 py-3 border-b border-white/5 bg-white/3 flex items-center justify-between hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer select-none"
            >
              <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-widest">
                {formatPhase(phase)}
              </h3>
              <div className="flex items-center gap-3">
                {isCollapsed && (
                  <span className="text-[11px] text-slate-400">
                    {finishedCount}/{total} jugados
                    {finishedCount > 0 && (
                      <span className="text-yellow-400 font-semibold ml-1.5">· {phasePoints}pts</span>
                    )}
                  </span>
                )}
                <span className={`text-slate-500 text-xs transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}>
                  ▲
                </span>
              </div>
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-white/5">
                {phaseRows.map(({ prediction, match }) => {
                  const finished = match.status === 'finished'
                  const isLive = match.status === 'live'
                  const hasResult = match.home_score !== null && match.away_score !== null
                  const pts = (finished || isLive) && hasResult
                    ? calcPoints(
                        { predicted_home: Number(prediction.predicted_home), predicted_away: Number(prediction.predicted_away) },
                        { home_score: Number(match.home_score), away_score: Number(match.away_score) }
                      )
                    : 0

                  return (
                    <div key={prediction.id} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2 min-w-0">
                        <FlagImg team={match.home_team} />
                        <span className="text-white font-semibold text-sm">{match.home_team}</span>
                        <span className="text-slate-600 text-xs mx-0.5 shrink-0">vs</span>
                        <span className="text-white font-semibold text-sm">{match.away_team}</span>
                        <FlagImg team={match.away_team} />
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Pred</span>
                          <span className="font-display text-lg text-slate-200 leading-none">
                            {prediction.predicted_home}–{prediction.predicted_away}
                          </span>
                        </div>

                        {hasResult ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                              {isLive ? '⚡' : 'Res'}
                            </span>
                            <span className={`font-display text-lg leading-none ${isLive ? 'text-red-400' : 'text-yellow-400'}`}>
                              {match.home_score}–{match.away_score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-600">–</span>
                        )}

                        {finished && (
                          <span className={`ml-auto text-xs px-2.5 py-1 rounded-full border font-semibold shrink-0 ${POINTS_COLOR[pts] ?? POINTS_COLOR[0]}`}>
                            {POINTS_LABEL[pts] ?? '–'} · {pts}pts
                          </span>
                        )}
                        {isLive && hasResult && (
                          <span className="ml-auto text-xs px-2.5 py-1 rounded-full border font-semibold shrink-0 text-red-400 bg-red-400/10 border-red-400/25 animate-pulse">
                            ⚡ {pts}pts
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function groupByPhase(rows: PredictionRow[]): Array<{ phase: string; rows: PredictionRow[] }> {
  const order: string[] = []
  const map: Record<string, PredictionRow[]> = {}
  for (const row of rows) {
    const phase = row.match.phase
    if (!map[phase]) { map[phase] = []; order.push(phase) }
    map[phase].push(row)
  }
  return order.map(phase => ({ phase, rows: map[phase] }))
}

const PHASE_LABELS: Record<string, string> = {
  PRIMERA_FECHA: 'Fecha 1 · Grupos',
  SEGUNDA_FECHA: 'Fecha 2 · Grupos',
  TERCERA_FECHA: 'Fecha 3 · Grupos',
  DIECISEISAVOS: 'Dieciseisavos de Final',
  OCTAVOS: 'Octavos de Final',
  CUARTOS: 'Cuartos de Final',
  SEMIFINALES: 'Semifinales',
  FINAL: 'Gran Final',
}

function formatPhase(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}

function PlayerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="card p-5 h-24 bg-white/5" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 h-10 bg-white/5" />
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="px-4 py-3 h-16 border-b border-white/5 bg-white/3" />
          ))}
        </div>
      ))}
    </div>
  )
}
