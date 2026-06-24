/**
 * Convierte el Excel de respuestas de formulario (Fecha 03)
 * al formato plantilla que espera el parser de la app.
 *
 * Estructura de entrada (respuestas):
 *   Fila 1: Marca temporal | NOMBRE | SUIZA - CÁNADA | BOSNIA - QATAR | ...
 *   Fila 2+: <timestamp> | <nombre> | "2-3" | "1-0" | ...
 *
 * Estructura de salida (plantilla):
 *   Fila 1 (row 0): vacío | vacío | vacío | vacío | "TERCERA FECHA" | ...
 *   Fila 2 (row 1): NRO | JUGADORES POLLA GORETTIANA | TOTAL | ACIERTOS | LOCAL | VISIT | PUNTOS | LOCAL | VISIT | PUNTOS | ...
 *   Fila 3 (row 2): vacío | vacío | vacío | vacío | <local_real> | <visit_real> | ... (resultados reales - dejar vacío)
 *   Fila 4+ (row 3+): num | nombre | total | aciertos | local_pred | visit_pred | | local_pred | visit_pred | | ...
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data_Excel')

const INPUT  = join(dataDir, 'MUNDIAL 2026 FECHA 03 (respuestas).xlsx')
const OUTPUT = join(dataDir, 'POLLA MUNDIAL TERCERA FECHA.xlsx')

// Leer archivo fuente
const srcWb = XLSX.readFile(INPUT)
const srcSheet = srcWb.Sheets[srcWb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(srcSheet, { header: 1, defval: '' })

console.log(`Filas leídas: ${rows.length}`)
console.log(`Columnas en fila 1: ${rows[0].length}`)

// Fila 0 (índice 0) = encabezados
const headers = rows[0]
// Col 0 = Marca temporal, Col 1 = NOMBRE, Col 2+ = partidos
const matchHeaders = headers.slice(2)
console.log(`Partidos encontrados: ${matchHeaders.length}`)
matchHeaders.forEach((h, i) => console.log(`  ${i+1}. ${h}`))

// Filas 1+ = respuestas de participantes
const participants = []
for (let i = 1; i < rows.length; i++) {
  const row = rows[i]
  const name = String(row[1] ?? '').trim()
  if (!name) continue
  const predictions = row.slice(2)  // strings "2-3"
  participants.push({ name, predictions })
}
console.log(`\nParticipantes: ${participants.length}`)
participants.forEach((p, i) => console.log(`  ${i+1}. ${p.name}`))

// --- Construir la hoja de salida ---
const out = []

// Fila 0 (row 1 en Excel): marcador de fase en col 4 (índice 0-based)
const row0 = new Array(4 + matchHeaders.length * 3).fill('')
row0[4] = 'TERCERA FECHA'
out.push(row0)

// Fila 1 (row 2 en Excel): encabezados de columnas
const row1 = ['NRO', 'JUGADORES POLLA GORETTIANA', 'TOTAL', 'ACIERTOS']
for (const mh of matchHeaders) {
  const sep = mh.includes(' - ') ? ' - ' : ' -'
  const idx = mh.indexOf(sep)
  const localTeam = idx >= 0 ? mh.slice(0, idx).trim() : mh.trim()
  const visitTeam = idx >= 0 ? mh.slice(idx + sep.length).trim() : '?'
  row1.push(localTeam, visitTeam, 'PUNTOS')
}
out.push(row1)

// Fila 2 (row 3 en Excel): resultados reales — vacíos (el admin los llenará)
const row2 = new Array(row1.length).fill('')
out.push(row2)

// Filas 3+ (row 4+ en Excel): predicciones
for (let i = 0; i < participants.length; i++) {
  const p = participants[i]
  const row = [i + 1, p.name, 0, 0]

  for (let j = 0; j < matchHeaders.length; j++) {
    const score = String(p.predictions[j] ?? '').trim()
    const dashIdx = score.indexOf('-')
    let localScore = ''
    let visitScore = ''
    if (dashIdx >= 0) {
      localScore = parseInt(score.slice(0, dashIdx).trim(), 10)
      visitScore = parseInt(score.slice(dashIdx + 1).trim(), 10)
      if (isNaN(localScore)) localScore = ''
      if (isNaN(visitScore)) visitScore = ''
    }
    row.push(localScore, visitScore, '')  // vacío en PUNTOS para que el sistema los calcule
  }

  out.push(row)
}

// Crear workbook de salida
const ws = XLSX.utils.aoa_to_sheet(out)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
XLSX.writeFile(wb, OUTPUT)

console.log(`\nArchivo generado: ${OUTPUT}`)
console.log(`Filas totales: ${out.length} | Columnas: ${row1.length}`)
