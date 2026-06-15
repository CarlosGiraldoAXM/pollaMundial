import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'polla' },
})

// Types matching our schema
export interface Participant {
  id: string
  name: string
  total_points: number
  created_at: string
}

export interface Match {
  id: string
  match_key: string
  phase: string
  home_team: string
  away_team: string
  match_order: number
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'live' | 'finished'
  match_date: string | null
  api_match_id: string | null
  created_at: string
}

export interface Prediction {
  id: string
  participant_id: string
  match_id: string
  predicted_home: number
  predicted_away: number
  points_earned: number
}

export interface PredictionWithMatch extends Prediction {
  matches: Match
}
