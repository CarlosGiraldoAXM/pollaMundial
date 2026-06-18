import { useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchOFBResults, fetchOFBMatches } from '../lib/openfootball'
import { recalcMatchPredictions } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import type { Match } from '../lib/supabase'
import { normalizeTeamName } from '../constants/teamMapping'

function normName(name: string) {
  return normalizeTeamName(name).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function useOFBUpdater() {
  const queryClient = useQueryClient()
  const isRunningRef = useRef(false)
  const [isFetching, setIsFetching] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  const triggerOFBUpdate = useCallback(async () => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    setIsFetching(true)
    setLastError(null)
    setSummary(null)

    try {
      const [ofbResults, { data: dbMatches, error: dbError }] = await Promise.all([
        fetchOFBResults(),
        supabase.from('matches').select('*'),
      ])
      if (dbError) throw new Error(dbError.message)
      if (!dbMatches) throw new Error('No se pudo leer la base de datos')

      let updated = 0
      const toRecalc: { id: string; home: number; away: number }[] = []

      for (const ofb of ofbResults) {
        const ofbHome = normName(ofb.team1)
        const ofbAway = normName(ofb.team2)

        // Intentar matching en orden normal
        let dbMatch = (dbMatches as Match[]).find(m =>
          normName(m.home_team) === ofbHome && normName(m.away_team) === ofbAway
        )
        let reversed = false

        // Si no encuentra, intentar con equipos invertidos
        // (el Excel puede tener el orden opuesto al que usa openfootball)
        if (!dbMatch) {
          dbMatch = (dbMatches as Match[]).find(m =>
            normName(m.home_team) === ofbAway && normName(m.away_team) === ofbHome
          )
          reversed = true
        }
        if (!dbMatch) continue

        // Partido ya confirmado en BD — ignorar
        if (dbMatch.status === 'finished') continue

        // Si los equipos están invertidos, también se invierten los goles
        const homeScore = reversed ? ofb.awayScore : ofb.homeScore
        const awayScore = reversed ? ofb.homeScore : ofb.awayScore

        const { error } = await supabase
          .from('matches')
          .update({ home_score: homeScore, away_score: awayScore, status: 'finished' })
          .eq('id', dbMatch.id)
        if (error) throw new Error(error.message)

        toRecalc.push({ id: dbMatch.id, home: homeScore, away: awayScore })
        updated++
      }

      for (const { id, home, away } of toRecalc) {
        await recalcMatchPredictions(supabase, id, home, away)
      }

      await fetchOFBMatches(true)

      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['matches-admin'] })
      queryClient.invalidateQueries({ queryKey: ['participants'] })
      queryClient.invalidateQueries({ queryKey: ['player'] })
      queryClient.invalidateQueries({ queryKey: ['ofb-matches'] })

      const total = ofbResults.length
      setSummary(
        updated > 0
          ? `${updated} partido${updated !== 1 ? 's' : ''} actualizado${updated !== 1 ? 's' : ''} · ${total} terminados en openfootball`
          : `Sin cambios — ${total} partido${total !== 1 ? 's' : ''} terminado${total !== 1 ? 's' : ''} ya estaban sincronizados`
      )
      setLastUpdated(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
    } finally {
      isRunningRef.current = false
      setIsFetching(false)
    }
  }, [queryClient])

  return { triggerOFBUpdate, isFetching, lastUpdated, lastError, summary }
}
