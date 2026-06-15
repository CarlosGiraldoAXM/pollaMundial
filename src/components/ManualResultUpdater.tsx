import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Match } from '../lib/supabase'
import { recalcMatchPredictions } from '../lib/scoring'

async function fetchMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('match_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export function ManualResultUpdater() {
  const queryClient = useQueryClient()
  const { data: matches = [] } = useQuery({ queryKey: ['matches-admin'], queryFn: fetchMatches })

  const [matchId, setMatchId] = useState('')
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const selectedMatch = matches.find(m => m.id === matchId)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!matchId || homeScore === '' || awayScore === '') return

    const home = Number(homeScore)
    const away = Number(awayScore)
    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      setErrorMsg('Ingresá goles válidos (números ≥ 0).')
      setStatus('error')
      return
    }

    setStatus('saving')
    setErrorMsg('')

    try {
      // 1. Actualizar el partido
      const { error } = await supabase
        .from('matches')
        .update({ home_score: home, away_score: away, status: 'finished' })
        .eq('id', matchId)
      if (error) throw error

      // 2. Recalcular puntos de todos los que predijeron ese partido
      await recalcMatchPredictions(supabase, matchId, home, away)

      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['matches-admin'] })
      queryClient.invalidateQueries({ queryKey: ['participants'] })

      setStatus('ok')
      // Reset form después de 2 segundos
      setTimeout(() => {
        setMatchId('')
        setHomeScore('')
        setAwayScore('')
        setStatus('idle')
      }, 2000)
    } catch (err) {
      setErrorMsg(String(err))
      setStatus('error')
    }
  }

  const PHASE_LABELS: Record<string, string> = {
    PRIMERA_FECHA: 'Fecha 1',
    SEGUNDA_FECHA: 'Fecha 2',
    TERCERA_FECHA: 'Fecha 3',
    DIECISEISAVOS: '1/16',
    OCTAVOS: 'Octavos',
    CUARTOS: 'Cuartos',
    SEMIFINALES: 'Semis',
    FINAL: 'Final',
  }

  // Agrupar partidos por fase para el select
  const grouped = matches.reduce<Record<string, Match[]>>((acc, m) => {
    if (!acc[m.phase]) acc[m.phase] = []
    acc[m.phase].push(m)
    return acc
  }, {})

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Selector de partido */}
      <div>
        <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
          Partido
        </label>
        <select
          value={matchId}
          onChange={e => setMatchId(e.target.value)}
          required
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-400/50 transition-colors"
        >
          <option value="" className="bg-slate-800">— Seleccioná un partido —</option>
          {Object.entries(grouped).map(([phase, phaseMatches]) => (
            <optgroup key={phase} label={PHASE_LABELS[phase] ?? phase} className="bg-slate-800">
              {phaseMatches.map(m => (
                <option key={m.id} value={m.id} className="bg-slate-800">
                  {m.home_team} vs {m.away_team}
                  {m.home_score !== null ? ` (${m.home_score}–${m.away_score})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Preview del resultado actual si existe */}
      {selectedMatch && selectedMatch.home_score !== null && (
        <div className="text-xs text-slate-400 bg-white/5 rounded-lg px-3 py-2">
          Resultado actual: <span className="text-yellow-400 font-semibold">
            {selectedMatch.home_score} – {selectedMatch.away_score}
          </span> · vas a sobreescribir este valor
        </div>
      )}

      {/* Inputs de goles */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
            {selectedMatch ? selectedMatch.home_team : 'Local'}
          </label>
          <input
            type="number"
            min="0"
            max="99"
            value={homeScore}
            onChange={e => setHomeScore(e.target.value)}
            required
            placeholder="0"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-center font-display text-2xl focus:outline-none focus:border-yellow-400/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
            {selectedMatch ? selectedMatch.away_team : 'Visitante'}
          </label>
          <input
            type="number"
            min="0"
            max="99"
            value={awayScore}
            onChange={e => setAwayScore(e.target.value)}
            required
            placeholder="0"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-center font-display text-2xl focus:outline-none focus:border-yellow-400/50 transition-colors"
          />
        </div>
      </div>

      {/* Feedback */}
      {status === 'error' && (
        <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>
      )}
      {status === 'ok' && (
        <p className="text-green-400 text-sm">✓ Resultado guardado y puntos recalculados.</p>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !matchId || homeScore === '' || awayScore === ''}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {status === 'saving' ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Guardando...
          </>
        ) : (
          '💾 Guardar resultado y recalcular puntos'
        )}
      </button>
    </form>
  )
}
