import * as XLSX from 'xlsx'
import { normalizePhase } from '../constants/teamMapping'

export interface ParsedMatch {
  match_key: string
  phase: string
  home_team: string   // nombre original del Excel (para mostrar)
  away_team: string   // nombre original del Excel (para mostrar)
  match_order: number // posición en el Excel (para ordenar)
  col_index: number
}

export interface ParsedPrediction {
  participant_name: string
  match_key: string
  predicted_home: number
  predicted_away: number
}

export interface ParsedExcelData {
  matches: ParsedMatch[]
  predictions: ParsedPrediction[]
  participants: string[]
  warnings: string[]
}

// Genera una clave interna estable a partir del nombre original del Excel
// Elimina acentos y caracteres especiales, reemplaza espacios por guión bajo
function sanitizeKey(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')  // todo lo que no sea letra/número → _
    .replace(/_+/g, '_')          // colapsar múltiples _
    .replace(/^_|_$/g, '')        // quitar _ al inicio/fin
}

function cellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const ref = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = sheet[ref]
  if (!cell || cell.v === null || cell.v === undefined) return ''
  return String(cell.v).trim()
}

function cellNum(sheet: XLSX.WorkSheet, row: number, col: number): number | null {
  const ref = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = sheet[ref]
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null
  const n = Number(cell.v)
  return isNaN(n) ? null : n
}

const PHASE_KEYWORDS = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'DIECISES', 'OCTAVOS', 'CUARTOS', 'SEMIFINAL', 'FINAL']

function isPhaseMarker(value: string): boolean {
  const upper = value.toUpperCase()
  return PHASE_KEYWORDS.some(k => upper.includes(k))
}

function isIgnoredHeader(value: string): boolean {
  const upper = value.toUpperCase()
  return (
    upper.includes('JUGADORES') ||
    upper.includes('POLLA') ||
    upper === 'TOTAL' ||
    upper === 'PUNTOS' ||
    upper === 'NRO' ||
    upper === '#' ||
    upper === ''
  )
}

export function parseExcel(file: File): Promise<ParsedExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        resolve(parseSheet(sheet))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

function parseSheet(sheet: XLSX.WorkSheet): ParsedExcelData {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
  const warnings: string[] = []
  const matches: ParsedMatch[] = []
  const matchColMap = new Map<number, ParsedMatch>()

  // ── Paso 1: marcadores de fase en fila 0 ─────────────────────────────
  const phaseByCol = new Map<number, string>()
  for (let c = 0; c <= range.e.c; c++) {
    const val = cellStr(sheet, 0, c)
    if (val && isPhaseMarker(val)) {
      phaseByCol.set(c, normalizePhase(val))
    }
  }

  // ── Paso 2: partidos desde fila 1 — nombres originales del Excel ──────
  let currentPhase = 'PRIMERA_FECHA'
  let matchOrder = 0

  for (let c = 0; c <= range.e.c - 1; c++) {
    if (phaseByCol.has(c)) currentPhase = phaseByCol.get(c)!

    const val = cellStr(sheet, 1, c)
    if (!val || isIgnoredHeader(val)) continue

    const nextVal = cellStr(sheet, 1, c + 1)
    const afterNext = cellStr(sheet, 1, c + 2)

    if (nextVal && !isIgnoredHeader(nextVal) && afterNext.toUpperCase() === 'PUNTOS') {
      // Clave interna: usa nombres saneados (sin acentos, sin puntos)
      const baseKey = `${sanitizeKey(val)}_vs_${sanitizeKey(nextVal)}_${currentPhase}`
      let matchKey = baseKey
      let suffix = 2
      while (matches.some(m => m.match_key === matchKey)) {
        matchKey = `${baseKey}_${suffix++}`
      }

      const match: ParsedMatch = {
        match_key: matchKey,
        phase: currentPhase,
        home_team: val,      // nombre original tal cual viene del Excel
        away_team: nextVal,  // nombre original tal cual viene del Excel
        match_order: matchOrder++,
        col_index: c,
      }
      matches.push(match)
      matchColMap.set(c, match)
      c += 2
    }
  }

  // ── Paso 3: participantes y predicciones desde fila 3 ────────────────
  const participants: string[] = []
  const predictions: ParsedPrediction[] = []

  for (let r = 3; r <= range.e.r; r++) {
    const name = cellStr(sheet, r, 1)
    if (!name || /^\d+$/.test(name)) continue

    const trimmed = name.trim()
    if (!trimmed) continue

    if (!participants.includes(trimmed)) participants.push(trimmed)

    for (const [col, match] of matchColMap) {
      const predHome = cellNum(sheet, r, col)
      const predAway = cellNum(sheet, r, col + 1)
      if (predHome !== null && predAway !== null) {
        predictions.push({
          participant_name: trimmed,
          match_key: match.match_key,
          predicted_home: predHome,
          predicted_away: predAway,
        })
      }
    }
  }

  if (matches.length === 0) {
    warnings.push('No se encontraron partidos. Verificá que la fila 2 tenga equipos en grupos de 3 columnas (LOCAL · VISITANTE · PUNTOS).')
  }
  if (participants.length === 0) {
    warnings.push('No se encontraron participantes. Los datos deben empezar en la fila 4.')
  }

  return { matches, predictions, participants, warnings }
}
