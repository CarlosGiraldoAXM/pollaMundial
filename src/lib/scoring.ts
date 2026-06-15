export type MatchResult = {
  home_score: number
  away_score: number
}

export type Prediction = {
  predicted_home: number
  predicted_away: number
}

export function calcPoints(prediction: Prediction, result: MatchResult): number {
  const { predicted_home, predicted_away } = prediction
  const { home_score, away_score } = result

  // Exact score → 3 points
  if (predicted_home === home_score && predicted_away === away_score) return 3

  // Correct winner/draw → 1 point
  const predSign = Math.sign(predicted_home - predicted_away)
  const realSign = Math.sign(home_score - away_score)
  if (predSign === realSign) return 1

  return 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export async function recalcParticipantPoints(
  supabase: AnySupabaseClient,
  participantId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('predictions')
    .select('points_earned')
    .eq('participant_id', participantId)

  if (error) throw error

  const total = (data ?? []).reduce((sum, p) => sum + (p.points_earned ?? 0), 0)

  await supabase
    .from('participants')
    .update({ total_points: total })
    .eq('id', participantId)

  return total
}

export async function recalcMatchPredictions(
  supabase: AnySupabaseClient,
  matchId: string,
  home_score: number,
  away_score: number
): Promise<void> {
  const { data: preds, error } = await supabase
    .from('predictions')
    .select('id, participant_id, predicted_home, predicted_away')
    .eq('match_id', matchId)

  if (error) throw error
  if (!preds?.length) return

  const result = { home_score, away_score }
  const updates = preds.map(p => ({
    id: p.id,
    points_earned: calcPoints(
      { predicted_home: p.predicted_home, predicted_away: p.predicted_away },
      result
    ),
  }))

  // Batch upsert points
  for (const upd of updates) {
    await supabase.from('predictions').update({ points_earned: upd.points_earned }).eq('id', upd.id)
  }

  // Recalc totals for all affected participants
  const participantIds = [...new Set(preds.map(p => p.participant_id))]
  for (const pid of participantIds) {
    await recalcParticipantPoints(supabase, pid)
  }
}
