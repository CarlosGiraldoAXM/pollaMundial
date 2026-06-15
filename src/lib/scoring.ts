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

// Recalcula puntos de TODOS los partidos terminados en una sola pasada.
// Mucho más eficiente que llamar recalcMatchPredictions por cada partido.
export async function recalcAllPoints(supabase: AnySupabaseClient): Promise<void> {
  // 1. Partidos terminados con marcador
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, home_score, away_score')
    .eq('status', 'finished')
  if (mErr) throw mErr
  if (!matches?.length) return

  // 2. Todas las predicciones
  const { data: preds, error: pErr } = await supabase
    .from('predictions')
    .select('id, participant_id, match_id, predicted_home, predicted_away')
  if (pErr) throw pErr
  if (!preds?.length) return

  // 3. Calcular puntos en memoria
  const matchMap = new Map(matches.map(m => [m.id, m]))
  const pointsById = new Map<string, number>()   // prediction id → pts
  const totalByParticipant = new Map<string, number>()

  // Inicializar totales en 0 para todos los participantes
  for (const p of preds) totalByParticipant.set(p.participant_id, 0)

  for (const pred of preds) {
    const match = matchMap.get(pred.match_id)
    const pts = match && match.home_score !== null && match.away_score !== null
      ? calcPoints(
          { predicted_home: pred.predicted_home, predicted_away: pred.predicted_away },
          { home_score: match.home_score, away_score: match.away_score }
        )
      : 0
    pointsById.set(pred.id, pts)
    totalByParticipant.set(pred.participant_id, (totalByParticipant.get(pred.participant_id) ?? 0) + pts)
  }

  // 4. Batch upsert de predicciones (grupos de 100)
  const updates = preds
    .filter(p => matchMap.has(p.match_id))   // solo las de partidos terminados
    .map(p => ({ id: p.id, points_earned: pointsById.get(p.id) ?? 0 }))

  for (let i = 0; i < updates.length; i += 100) {
    await supabase.from('predictions').upsert(updates.slice(i, i + 100), { onConflict: 'id' })
  }

  // 5. Actualizar total_points de cada participante
  for (const [pid, total] of totalByParticipant) {
    await supabase.from('participants').update({ total_points: total }).eq('id', pid)
  }
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
