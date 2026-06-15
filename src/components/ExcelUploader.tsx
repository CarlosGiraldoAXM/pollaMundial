import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { parseExcel, type ParsedExcelData } from '../lib/excelParser'
import { supabase } from '../lib/supabase'
import { recalcAllPoints } from '../lib/scoring'

interface Props {
  onSuccess?: () => void
}

type UploadState = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error'

export function ExcelUploader({ onSuccess }: Props) {
  const [state, setState] = useState<UploadState>('idle')
  const [parsed, setParsed] = useState<ParsedExcelData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setErrorMsg('Solo se aceptan archivos Excel (.xlsx / .xls)')
      setState('error')
      return
    }
    setState('parsing')
    setErrorMsg('')
    try {
      const data = await parseExcel(file)
      setParsed(data)
      setState('preview')
    } catch (err) {
      setErrorMsg(`Error al parsear: ${String(err)}`)
      setState('error')
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function confirmUpload() {
    if (!parsed) return
    setState('uploading')

    try {
      // 1. Upsert participants
      setProgress('Subiendo participantes...')
      for (const name of parsed.participants) {
        await supabase
          .from('participants')
          .upsert({ name }, { onConflict: 'name', ignoreDuplicates: false })
      }

      // 2. Upsert matches
      setProgress('Subiendo partidos...')
      for (const m of parsed.matches) {
        await supabase.from('matches').upsert(
          {
            match_key: m.match_key,
            phase: m.phase,
            home_team: m.home_team,
            away_team: m.away_team,
            match_order: m.match_order,
          },
          { onConflict: 'match_key', ignoreDuplicates: false }
        )
      }

      // 3. Fetch IDs we need
      setProgress('Vinculando predicciones...')
      const { data: participants } = await supabase.from('participants').select('id, name')
      const { data: matches } = await supabase.from('matches').select('id, match_key')

      const participantMap = new Map((participants ?? []).map(p => [p.name, p.id]))
      const matchMap = new Map((matches ?? []).map(m => [m.match_key, m.id]))

      // 4. Upsert predictions — NO incluir points_earned para no resetear puntos calculados
      const predRows = parsed.predictions.map(pred => ({
        participant_id: participantMap.get(pred.participant_name),
        match_id: matchMap.get(pred.match_key),
        predicted_home: pred.predicted_home,
        predicted_away: pred.predicted_away,
      })).filter(r => r.participant_id && r.match_id)

      // Batch in groups of 100
      for (let i = 0; i < predRows.length; i += 100) {
        const batch = predRows.slice(i, i + 100)
        await supabase.from('predictions').upsert(batch, {
          onConflict: 'participant_id,match_id',
          ignoreDuplicates: false,
        })
        setProgress(`Predicciones: ${Math.min(i + 100, predRows.length)}/${predRows.length}`)
      }

      // 5. Recalcular puntos de partidos ya terminados (por si se re-sube el Excel)
      setProgress('Recalculando puntos...')
      await recalcAllPoints(supabase)

      setState('done')
      onSuccess?.()
    } catch (err) {
      setErrorMsg(`Error al subir: ${String(err)}`)
      setState('error')
    }
  }

  function reset() {
    setState('idle')
    setParsed(null)
    setErrorMsg('')
    setProgress('')
    if (inputRef.current) inputRef.current.value = ''
  }

  if (state === 'done') {
    return (
      <div className="card p-8 text-center">
        <p className="text-5xl mb-3">✅</p>
        <p className="text-green-400 font-semibold text-lg">¡Datos subidos correctamente!</p>
        <p className="text-slate-400 text-sm mt-1">
          {parsed?.participants.length} participantes · {parsed?.matches.length} partidos · {parsed?.predictions.length} predicciones
        </p>
        <button onClick={reset} className="mt-6 px-6 py-2 border border-yellow-400/50 text-yellow-400 rounded-lg hover:bg-yellow-400/10 transition-colors">
          Subir otro archivo
        </button>
      </div>
    )
  }

  if (state === 'preview' && parsed) {
    return (
      <div className="space-y-4">
        <div className="card p-4 border-yellow-400/30">
          <h3 className="text-yellow-400 font-semibold mb-3">Vista previa del Excel</h3>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <Stat label="Participantes" value={parsed.participants.length} />
            <Stat label="Partidos" value={parsed.matches.length} />
            <Stat label="Predicciones" value={parsed.predictions.length} />
          </div>

          {parsed.warnings.length > 0 && (
            <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-3 mb-4">
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-yellow-300 text-sm">⚠️ {w}</p>
              ))}
            </div>
          )}

          <details className="mt-3">
            <summary className="text-slate-400 text-sm cursor-pointer hover:text-white transition-colors">
              Ver partidos detectados ({parsed.matches.length})
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto scrollbar-thin space-y-1">
              {parsed.matches.map(m => (
                <div key={m.match_key} className="text-xs text-slate-300 flex gap-2">
                  <span className="text-slate-500 shrink-0">{m.phase}</span>
                  <span>{m.home_team} vs {m.away_team}</span>
                </div>
              ))}
            </div>
          </details>

          <details className="mt-2">
            <summary className="text-slate-400 text-sm cursor-pointer hover:text-white transition-colors">
              Ver participantes ({parsed.participants.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {parsed.participants.map(p => (
                <span key={p} className="text-xs bg-white/5 px-2 py-0.5 rounded text-slate-300">{p}</span>
              ))}
            </div>
          </details>
        </div>

        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-3 border border-white/20 text-slate-400 rounded-lg hover:border-white/40 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmUpload}
            className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-300 text-navy font-bold rounded-lg transition-colors"
          >
            Confirmar y subir
          </button>
        </div>
      </div>
    )
  }

  if (state === 'uploading') {
    return (
      <div className="card p-8 text-center">
        <div className="inline-block w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white font-medium">Subiendo datos...</p>
        <p className="text-slate-400 text-sm mt-1">{progress}</p>
      </div>
    )
  }

  return (
    <div>
      {state === 'error' && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-yellow-400 bg-yellow-400/5'
            : 'border-white/20 hover:border-yellow-400/50 hover:bg-white/3'
        }`}
      >
        <p className="text-4xl mb-3">{state === 'parsing' ? '⏳' : '📊'}</p>
        <p className="text-white font-medium">
          {state === 'parsing' ? 'Parseando Excel...' : 'Arrastrá el Excel acá'}
        </p>
        <p className="text-slate-500 text-sm mt-1">o hacé clic para seleccionar · .xlsx / .xls</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-3xl text-yellow-400">{value}</p>
      <p className="text-slate-400 text-xs">{label}</p>
    </div>
  )
}
