import { RankingTable } from '../components/RankingTable'
import { MatchList } from '../components/MatchList'
import { useMatchUpdater } from '../hooks/useMatchUpdater'

export function Home() {
  useMatchUpdater()

  return (
    <main className="max-w-5xl mx-auto px-4 pb-12">
      {/* Hero */}
      <div className="relative text-center py-10 overflow-hidden select-none">
        {/* Giant decorative ball */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: '18rem', opacity: 0.025, lineHeight: 1 }}>⚽</span>
        </div>
        <div className="relative">
          <p className="text-[10px] font-semibold text-yellow-400/60 uppercase tracking-[0.45em] mb-3">
            ⚽ &nbsp; Polla Gorettiana &nbsp; · &nbsp; Junio 2026
          </p>
          <h1 className="font-display gradient-text leading-none tracking-widest" style={{ fontSize: 'clamp(4rem, 12vw, 7rem)' }}>
            MUNDIAL<br />2026
          </h1>
          <p className="text-slate-600 text-xs tracking-[0.3em] uppercase mt-4">
            Clasificación en Tiempo Real
          </p>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <RankingTable />
        <MatchList />
      </div>
    </main>
  )
}
