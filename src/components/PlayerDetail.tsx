import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Participant, Match, Prediction } from '../lib/supabase'

interface PredictionRow {
  prediction: Prediction
  match: Match
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
    .select('*, matches(*)')
    .eq('participant_id', p.id)

  const rows: PredictionRow[] = (preds ?? [])
    .map((pred: Prediction & { matches: Match }) => ({
      prediction: pred,
      match: pred.matches,
    }))
    .sort((a, b) => (a.match.match_order ?? 0) - (b.match.match_order ?? 0))

  return { participant: p, rows }
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
  const { data, isLoading, error } = useQuery({
    queryKey: ['player', name],
    queryFn: () => fetchPlayerData(name),
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

  const { participant, rows } = data
  const grouped = groupByPhase(rows)

  return (
    <div className="space-y-6">
      {/* Player header */}
      <div className="card p-6 flex items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-navy font-display text-3xl">
          {participant.name[0]}
        </div>
        <div>
          <h1 className="text-2xl font-display tracking-wider text-white">{participant.name}</h1>
          <p className="text-slate-400 text-sm">Participante · Polla Gorettiana</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-display text-5xl text-yellow-400">{participant.total_points}</p>
          <p className="text-slate-400 text-xs uppercase tracking-wider">puntos</p>
        </div>
      </div>

      {/* Predictions by phase */}
      {grouped.map(({ phase, rows: phaseRows }) => (
        <div key={phase} className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 bg-white/3">
            <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-widest">
              {formatPhase(phase)}
            </h3>
          </div>
          <div className="divide-y divide-white/5">
            {phaseRows.map(({ prediction, match }) => {
              const pts = prediction.points_earned
              const finished = match.status === 'finished'
              const hasResult = match.home_score !== null && match.away_score !== null

              return (
                <div key={prediction.id} className="px-5 py-4 flex items-center gap-4">
                  {/* Match */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-white font-medium truncate">{match.home_team}</span>
                      <span className="text-slate-500 shrink-0">vs</span>
                      <span className="text-white font-medium truncate">{match.away_team}</span>
                    </div>
                  </div>

                  {/* Prediction */}
                  <div className="text-center shrink-0">
                    <p className="text-xs text-slate-500 mb-0.5">Predicción</p>
                    <p className="font-display text-xl text-slate-200">
                      {prediction.predicted_home} – {prediction.predicted_away}
                    </p>
                  </div>

                  {/* Result */}
                  <div className="text-center shrink-0">
                    <p className="text-xs text-slate-500 mb-0.5">Resultado</p>
                    {hasResult ? (
                      <p className="font-display text-xl text-yellow-400">
                        {match.home_score} – {match.away_score}
                      </p>
                    ) : (
                      <p className="text-slate-600 text-sm">{match.status === 'live' ? '⚡ En vivo' : '–'}</p>
                    )}
                  </div>

                  {/* Points badge */}
                  {finished && (
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold shrink-0 ${POINTS_COLOR[pts] ?? POINTS_COLOR[0]}`}>
                      {POINTS_LABEL[pts] ?? '–'} · {pts}pts
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
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
  PRIMERA_FECHA: 'Fase de Grupos · Fecha 1',
  SEGUNDA_FECHA: 'Fase de Grupos · Fecha 2',
  TERCERA_FECHA: 'Fase de Grupos · Fecha 3',
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
    <div className="space-y-6 animate-pulse">
      <div className="card p-6 h-28 bg-white/5" />
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 h-10 bg-white/5" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-5 py-4 h-16 border-b border-white/5 bg-white/3" />
        ))}
      </div>
    </div>
  )
}
