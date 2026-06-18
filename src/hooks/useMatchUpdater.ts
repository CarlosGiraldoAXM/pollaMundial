import { useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchAllMatches } from '../lib/matchApi'
import { recalcAllPoints } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import type { Match } from '../lib/supabase'
import { normalizeTeamName } from '../constants/teamMapping'

// Convierte "MM/DD/YYYY HH:mm" → "YYYY-MM-DDTHH:mm:00" que PostgreSQL acepta como timestamptz
function apiDateToISO(localDate: string): string | null {
  const m = localDate.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/)
  if (!m) return null
  return `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:00`
}

function normTeam(name: string) {
  return normalizeTeamName(name).toLowerCase()
}

export function useMatchUpdater() {
  const queryClient = useQueryClient()
  const isFetchingRef = useRef(false)
  const isRecalcRef = useRef(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const triggerUpdate = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsFetching(true)
    setLastError(null)

    try {
      const [apiMatches, { data: dbMatches }] = await Promise.all([
        fetchAllMatches(true),
        supabase.from('matches').select('*'),
      ])
      if (!dbMatches) return

      let anyFinishedChange = false

      for (const api of apiMatches) {
        const apiHome = normTeam(api.home_team)
        const apiAway = normTeam(api.away_team)

        // Intentar matching en orden normal (home=home, away=away)
        let dbMatch = (dbMatches as Match[]).find(
          m => normTeam(m.home_team) === apiHome && normTeam(m.away_team) === apiAway
        )
        let reversed = false

        // Si no encuentra, intentar con equipos invertidos
        // (el Excel puede tener el orden opuesto al API)
        if (!dbMatch) {
          dbMatch = (dbMatches as Match[]).find(
            m => normTeam(m.home_team) === apiAway && normTeam(m.away_team) === apiHome
          )
          reversed = true
        }
        if (!dbMatch) continue

        // Partido ya confirmado en BD — ignorar lo que diga el API
        if (dbMatch.status === 'finished') continue

        // Calcular scores corregidos según orientación
        // Solo guardar scores si el partido está en curso o terminó — el API worldcup26.ir
        // pre-rellena 0-0 para partidos no empezados (notstarted) lo que daría falsos resultados
        const scoreHome = reversed ? api.away_score : api.home_score
        const scoreAway = reversed ? api.home_score : api.away_score
        const hasRealScore =
          (api.status === 'finished' || api.status === 'live') &&
          scoreHome !== null &&
          scoreAway !== null

        const statusChanged = dbMatch.status !== api.status
        const scoreChanged =
          hasRealScore &&
          (dbMatch.home_score !== scoreHome || dbMatch.away_score !== scoreAway)
        const dateChanged = api.date && dbMatch.match_date !== api.date

        // Si el partido no ha comenzado pero la BD tiene scores (ceros pre-partido
        // que se colaron de una sync anterior), limpiarlos ahora
        const hasFalseScore =
          api.status === 'scheduled' &&
          dbMatch.status !== 'finished' &&
          (dbMatch.home_score !== null || dbMatch.away_score !== null)

        if (!statusChanged && !scoreChanged && !dateChanged && !hasFalseScore) continue

        const payload: Record<string, unknown> = { status: api.status, api_match_id: api.id }
        if (hasRealScore) {
          payload.home_score = scoreHome
          payload.away_score = scoreAway
        } else if (hasFalseScore) {
          payload.home_score = null
          payload.away_score = null
        }
        if (api.date) payload.match_date = apiDateToISO(api.date)
        await supabase.from('matches').update(payload).eq('id', dbMatch.id)

        if (api.status === 'finished') anyFinishedChange = true
      }

      if (anyFinishedChange) {
        await recalcAllPoints(supabase)
      }

      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['participants'] })
      queryClient.invalidateQueries({ queryKey: ['player'] })
      queryClient.invalidateQueries({ queryKey: ['api-matches'] })
      setLastUpdated(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
      console.error('Match updater error:', msg)
    } finally {
      isFetchingRef.current = false
      setIsFetching(false)
    }
  }, [queryClient])

  const triggerRecalc = useCallback(async () => {
    if (isRecalcRef.current) return
    isRecalcRef.current = true
    setIsRecalculating(true)
    setLastError(null)

    try {
      await recalcAllPoints(supabase)
      queryClient.invalidateQueries({ queryKey: ['participants'] })
      queryClient.invalidateQueries({ queryKey: ['player'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
    } finally {
      isRecalcRef.current = false
      setIsRecalculating(false)
    }
  }, [queryClient])

  return { triggerUpdate, isFetching, triggerRecalc, isRecalculating, lastUpdated, lastError }
}
