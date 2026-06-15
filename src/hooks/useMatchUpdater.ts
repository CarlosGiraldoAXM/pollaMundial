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

export function useMatchUpdater() {
  const queryClient = useQueryClient()
  const isFetchingRef = useRef(false)
  const isRecalcRef = useRef(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  // Consulta la API, sincroniza resultados y recalcula puntos en una sola pasada
  const triggerUpdate = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsFetching(true)
    setLastError(null)

    try {
      // 1. Traer datos de la API (20-30s) y de la DB en paralelo
      const [apiMatches, { data: dbMatches }] = await Promise.all([
        fetchAllMatches(true), // siempre datos frescos desde el panel admin
        supabase.from('matches').select('*'),
      ])
      if (!dbMatches) return

      // 2. Actualizar en DB solo los partidos que cambiaron (sin recalcular puntos todavía)
      let anyFinishedChange = false

      for (const api of apiMatches) {
        const dbMatch = (dbMatches as Match[]).find(
          m =>
            normalizeTeamName(m.home_team).toLowerCase() === api.home_team.toLowerCase() &&
            normalizeTeamName(m.away_team).toLowerCase() === api.away_team.toLowerCase()
        )
        if (!dbMatch) continue

        const statusChanged = dbMatch.status !== api.status
        const scoreChanged =
          api.home_score !== null &&
          api.away_score !== null &&
          (dbMatch.home_score !== api.home_score || dbMatch.away_score !== api.away_score)
        const dateChanged = api.date && dbMatch.match_date !== api.date

        if (!statusChanged && !scoreChanged && !dateChanged) continue

        const payload: Record<string, unknown> = { status: api.status, api_match_id: api.id }
        if (api.home_score !== null && api.away_score !== null) {
          payload.home_score = api.home_score
          payload.away_score = api.away_score
        }
        if (api.date) payload.match_date = apiDateToISO(api.date)
        await supabase.from('matches').update(payload).eq('id', dbMatch.id)

        if (api.status === 'finished') anyFinishedChange = true
      }

      // 3. Si algún partido terminó, recalcular todos los puntos en bulk (una sola pasada)
      if (anyFinishedChange) {
        await recalcAllPoints(supabase)
      }

      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['participants'] })
      queryClient.invalidateQueries({ queryKey: ['player'] })
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

  // Recalcula puntos de todos los partidos terminados sin tocar la API (operación bulk)
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
