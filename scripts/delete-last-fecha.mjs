/**
 * Script para eliminar la última fecha cargada (TERCERA_FECHA) de Supabase.
 *
 * Qué elimina:
 *   1. Predicciones de los partidos de TERCERA_FECHA (cascade automático al borrar matches)
 *   2. Partidos de TERCERA_FECHA
 *   3. Participantes duplicados (que existen SOLO en TERCERA_FECHA, sin predicciones en otras fechas)
 *
 * Uso:
 *   node scripts/delete-last-fecha.mjs          → solo muestra qué borrará (dry-run)
 *   node scripts/delete-last-fecha.mjs --delete  → ejecuta el borrado real
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://degzhrbjszdvlcqcfsik.supabase.co'
const SUPABASE_KEY = 'sb_publishable_s-pkf1e8wOECNqagZWHckg_MLzUj6Vk'
const PHASE        = 'TERCERA_FECHA'

const dryRun = !process.argv.includes('--delete')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'polla' },
})

async function main() {
  console.log(`\n=== ${dryRun ? 'DRY-RUN (sin cambios)' : '⚠️  BORRADO REAL'} ===`)
  console.log(`Fase a eliminar: ${PHASE}\n`)

  // 1. Obtener partidos de TERCERA_FECHA
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, match_key, home_team, away_team')
    .eq('phase', PHASE)
    .order('match_order')

  if (mErr) { console.error('Error leyendo matches:', mErr.message); process.exit(1) }

  console.log(`Partidos de ${PHASE}: ${matches.length}`)
  matches.forEach(m => console.log(`  - ${m.home_team} vs ${m.away_team}  [${m.match_key}]`))

  if (matches.length === 0) {
    console.log('\nNo hay datos de TERCERA_FECHA en la base de datos. Nada que borrar.')
    process.exit(0)
  }

  const matchIds = matches.map(m => m.id)

  // 2. Contar predicciones afectadas
  const { count: predCount, error: pErr } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .in('match_id', matchIds)

  if (pErr) { console.error('Error contando predictions:', pErr.message); process.exit(1) }
  console.log(`\nPredicciones que se eliminarán: ${predCount}`)

  // 3. Obtener participantes que SOLO tienen predicciones en TERCERA_FECHA (candidatos a duplicados)
  const { data: allParticipants, error: apErr } = await supabase
    .from('participants')
    .select('id, name')

  if (apErr) { console.error('Error leyendo participantes:', apErr.message); process.exit(1) }

  // Para cada participante, contar predicciones en otras fechas
  const orphanParticipants = []
  for (const p of allParticipants) {
    const { count: otherPreds } = await supabase
      .from('predictions')
      .select('id', { count: 'exact', head: true })
      .eq('participant_id', p.id)
      .not('match_id', 'in', `(${matchIds.join(',')})`)

    if (otherPreds === 0) {
      orphanParticipants.push(p)
    }
  }

  console.log(`\nParticipantes sin predicciones en otras fechas (solo TERCERA_FECHA): ${orphanParticipants.length}`)
  orphanParticipants.forEach(p => console.log(`  - ${p.name}  [${p.id}]`))

  // Participantes que SÍ tienen predicciones en otras fechas (se quedan)
  const keepParticipants = allParticipants.filter(p => !orphanParticipants.find(o => o.id === p.id))
  console.log(`\nParticipantes con datos en otras fechas (NO se tocan): ${keepParticipants.length}`)
  keepParticipants.forEach(p => console.log(`  - ${p.name}`))

  if (dryRun) {
    console.log('\n--- DRY-RUN completado. Para ejecutar el borrado real: ---')
    console.log('  node scripts/delete-last-fecha.mjs --delete\n')
    process.exit(0)
  }

  // ─── BORRADO REAL ────────────────────────────────────────────────────

  console.log('\n--- Ejecutando borrado ---')

  // Borrar predicciones de TERCERA_FECHA (por si el cascade no está activo via anon key)
  const { error: delPredErr } = await supabase
    .from('predictions')
    .delete()
    .in('match_id', matchIds)

  if (delPredErr) { console.error('Error borrando predicciones:', delPredErr.message); process.exit(1) }
  console.log(`✓ Predicciones de TERCERA_FECHA eliminadas`)

  // Borrar partidos de TERCERA_FECHA
  const { error: delMatchErr } = await supabase
    .from('matches')
    .delete()
    .eq('phase', PHASE)

  if (delMatchErr) { console.error('Error borrando matches:', delMatchErr.message); process.exit(1) }
  console.log(`✓ ${matches.length} partidos de TERCERA_FECHA eliminados`)

  // Borrar participantes que quedaron sin ninguna predicción
  if (orphanParticipants.length > 0) {
    const orphanIds = orphanParticipants.map(p => p.id)
    const { error: delPartErr } = await supabase
      .from('participants')
      .delete()
      .in('id', orphanIds)

    if (delPartErr) { console.error('Error borrando participantes:', delPartErr.message); process.exit(1) }
    console.log(`✓ ${orphanParticipants.length} participantes duplicados/huérfanos eliminados`)
  }

  console.log('\n✅ Limpieza completada. Ya puedes volver a cargar la fecha 3 con los nombres correctos.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
