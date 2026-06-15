import { useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useRealtime() {
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['participants'] })
  }, [queryClient])

  useEffect(() => {
    const channel = supabase
      .channel('realtime:participants')
      .on(
        'postgres_changes',
        { event: '*', schema: 'polla', table: 'participants' },
        () => invalidate()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'polla', table: 'matches' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matches'] })
          queryClient.invalidateQueries({ queryKey: ['participants'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [invalidate, queryClient])
}
