import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ExcelUploader } from '../components/ExcelUploader'
import { ManualResultUpdater } from '../components/ManualResultUpdater'
import { useMatchUpdater } from '../hooks/useMatchUpdater'
import { useOFBUpdater } from '../hooks/useOFBUpdater'
import { useQueryClient } from '@tanstack/react-query'

export function Admin() {
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const { triggerUpdate, isFetching, triggerRecalc, isRecalculating, lastUpdated, lastError } = useMatchUpdater()
  const { triggerOFBUpdate, isFetching: isOFBFetching, lastUpdated: ofbLastUpdated, lastError: ofbError, summary: ofbSummary } = useOFBUpdater()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login', { replace: true })
  }, [isAuthenticated, navigate])

  if (!isAuthenticated) return null

  function handleForceUpdate() {
    triggerUpdate()
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-yellow-400 tracking-wider">PANEL ADMIN</h1>
          <p className="text-slate-400 text-sm">Polla Gorettiana · Mundial 2026</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-red-400 transition-colors px-3 py-1.5 border border-white/10 rounded-lg hover:border-red-400/30"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="space-y-6">

        {/* 1. Subir Excel */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Subir Excel de Predicciones</h2>
          <p className="text-slate-400 text-sm mb-5">
            Subí el archivo Excel con las predicciones. Podés subir nuevas fechas a medida que avanza
            el torneo — los datos existentes se actualizan (upsert).
          </p>
          <ExcelUploader onSuccess={() => queryClient.invalidateQueries()} />
        </section>

        {/* 2. Actualizar desde API */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Actualizar desde worldcup26.ir</h2>

          {/* Aviso de latencia */}
          <div className="mb-4 p-3 rounded-lg bg-yellow-400/8 border border-yellow-400/20 text-xs text-yellow-300 flex gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <span>
              Esta API tarda entre <strong>20 y 30 segundos</strong> en responder porque devuelve todos los partidos del torneo.
              La página se actualiza sola cuando finaliza — no hace falta esperar en esta pantalla.
            </span>
          </div>

          {/* Estado en tiempo real */}
          <div className="mb-4 p-3 rounded-lg bg-white/3 border border-white/8 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs w-28 shrink-0">Estado:</span>
              {isFetching ? (
                <span className="flex items-center gap-2 text-yellow-400">
                  <span className="inline-block w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  Consultando API… (puede tardar hasta 40s)
                </span>
              ) : lastError ? (
                <span className="text-red-400">⚠️ {lastError}</span>
              ) : lastUpdated ? (
                <span className="text-emerald-400">✓ Actualizado</span>
              ) : (
                <span className="text-slate-600">En espera</span>
              )}
            </div>
            {lastUpdated && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs w-28 shrink-0">Última consulta:</span>
                <span className="text-slate-300">{formatTime(lastUpdated)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs w-28 shrink-0">Próx. auto:</span>
              <span className="text-slate-500">cada 90s en vivo · cada 5min en horario de partidos</span>
            </div>
          </div>

          <button
            onClick={handleForceUpdate}
            disabled={isFetching}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isFetching ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Consultando… (no cerrar esta pestaña)
              </>
            ) : (
              <><span>⚡</span> Forzar actualización ahora</>
            )}
          </button>
        </section>

        {/* 3. Recalcular puntos */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Recalcular Puntos</h2>
          <p className="text-slate-400 text-sm mb-4">
            Vuelve a calcular los puntos de todos los partidos terminados. Usá esto si los puntos
            aparecen en 0 aunque la predicción y el resultado coincidan.
          </p>
          {lastError && isRecalculating === false && (
            <p className="text-red-400 text-sm mb-3">⚠️ {lastError}</p>
          )}
          <button
            onClick={triggerRecalc}
            disabled={isRecalculating}
            className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isRecalculating ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Recalculando…
              </>
            ) : (
              <><span>🔄</span> Recalcular todos los puntos</>
            )}
          </button>
        </section>

        {/* 4. Sincronizar desde openfootball */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Sincronizar desde openfootball.github.io</h2>
          <p className="text-slate-400 text-sm mb-4">
            Alternativa cuando worldcup26.ir no responde. Lee resultados finales del JSON de openfootball,
            actualiza los marcadores en la base de datos y recalcula puntos automáticamente.
          </p>

          <div className="mb-4 p-3 rounded-lg bg-white/3 border border-white/8 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs w-28 shrink-0">Estado:</span>
              {isOFBFetching ? (
                <span className="flex items-center gap-2 text-yellow-400">
                  <span className="inline-block w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  Consultando openfootball…
                </span>
              ) : ofbError ? (
                <span className="text-red-400">⚠️ {ofbError}</span>
              ) : ofbSummary ? (
                <span className="text-emerald-400">✓ {ofbSummary}</span>
              ) : (
                <span className="text-slate-600">En espera</span>
              )}
            </div>
            {ofbLastUpdated && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs w-28 shrink-0">Última consulta:</span>
                <span className="text-slate-300">{formatTime(ofbLastUpdated)}</span>
              </div>
            )}
          </div>

          <button
            onClick={triggerOFBUpdate}
            disabled={isOFBFetching}
            className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isOFBFetching ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sincronizando…
              </>
            ) : (
              <><span>⚽</span> Sincronizar resultados desde openfootball</>
            )}
          </button>
        </section>

        {/* 5. Carga manual de resultado */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Cargar Resultado Manualmente</h2>
          <p className="text-slate-400 text-sm mb-5">
            Usá esto si ninguna API está disponible. Los puntos se recalculan automáticamente.
          </p>
          <ManualResultUpdater />
        </section>

        {/* 6. Sistema de puntuación */}
        <section className="card p-6 border-white/5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Sistema de Puntuación</h2>
          <div className="space-y-2">
            {[['3', 'text-emerald-400', 'Marcador exacto'], ['1', 'text-blue-400', 'Ganador o empate correcto'], ['0', 'text-slate-600', 'Sin acierto']].map(([pts, cls, label]) => (
              <div key={pts} className="flex items-center gap-3">
                <span className={`font-display text-xl w-8 text-center ${cls}`}>{pts}</span>
                <span className="text-slate-400 text-sm">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-slate-600 text-xs mt-3">Los puntos son excluyentes — exacto no acumula ganador.</p>
        </section>
      </div>
    </main>
  )
}
