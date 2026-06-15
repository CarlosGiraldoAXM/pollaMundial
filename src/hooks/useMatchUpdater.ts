import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchAllMatches } from '../lib/matchApi'
import { recalcMatchPredictions } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import type { Match } from '../lib/supabase'
import { normalizeTeamName } from '../constants/teamMapping'

const LIVE_INTERVAL = 90_000          // 90s cuando hay partido en vivo (API tarda ~30s)
const ACTIVE_INTERVAL = 15 * 60_000   // 15 min en horario de partidos sin vivos

// Colombia = UTC-5
// Partidos: 11am–1am COL (partido que empieza 11pm termina ~1am)
// = 16:00–06:00 UTC
function isMatchHour(): boolean {
  const h = new Date().getUTCHours()
  return h >= 16 || h < 6
}

export function useMatchUpdater() {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFetchingRef = useRef(false)       // evita llamadas simultáneas
  const [isFetching, setIsFetching] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const update = useCallback(async () => {
    // Si ya hay una llamada en curso, no lanzar otra
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsFetching(true)
    setLastError(null)

    try {
      // La API puede tardar 20-30s — el timeout está seteado en 40s en matchApi.ts
      const apiMatches = await fetchAllMatches()

      const { data: dbMatches } = await supabase.from('matches').select('*')
      if (!dbMatches) return

      let hasLive = false

      for (const api of apiMatches) {
        if (api.status === 'live') hasLive = true

        const dbMatch = (dbMatches as Match[]).find(
          m =>
            normalizeTeamName(m.home_team).toLowerCase() === api.home_team.toLowerCase() &&
            normalizeTeamName(m.away_team).toLowerCase() === api.away_team.toLowerCase()
        )
        if (!dbMatch) continue

        // Detectar qué cambió
        const statusChanged = dbMatch.status !== api.status
        const scoreChanged =
          api.home_score !== null &&
          api.away_score !== null &&
          (dbMatch.home_score !== api.home_score || dbMatch.away_score !== api.away_score)

        // Siempre sincronizar status (permite revertir "live" → "scheduled")
        if (!statusChanged && !scoreChanged) continue

        const payload: Record<string, unknown> = {
          status: api.status,
          api_match_id: api.id,
        }
        if (api.home_score !== null && api.away_score !== null) {
          payload.home_score = api.home_score
          payload.away_score = api.away_score
        }

        await supabase.from('matches').update(payload).eq('id', dbMatch.id)

        // Recalcular puntos solo al terminar el partido
        if (api.status === 'finished' && api.home_score !== null && api.away_score !== null) {
          await recalcMatchPredictions(supabase, dbMatch.id, api.home_score, api.away_score)
        }

        queryClient.invalidateQueries({ queryKey: ['matches'] })
        queryClient.invalidateQueries({ queryKey: ['participants'] })
      }

      setLastUpdated(new Date())

      // Programar próxima actualización automática
      const interval = hasLive ? LIVE_INTERVAL : isMatchHour() ? ACTIVE_INTERVAL : null
      if (interval) {
        timerRef.current = setTimeout(update, interval)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
      console.error('Match updater error:', msg)
      // Reintentar en 5 minutos si falla, solo si estamos en horario de partidos
      if (isMatchHour()) {
        timerRef.current = setTimeout(update, 5 * 60_000)
      }
    } finally {
      isFetchingRef.current = false
      setIsFetching(false)
    }
  }, [queryClient])

  useEffect(() => {
    update()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [update])

  return { triggerUpdate: update, isFetching, lastUpdated, lastError }
}
