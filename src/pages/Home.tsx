import { useState } from 'react'
import { RankingTable } from '../components/RankingTable'
import { MatchList } from '../components/MatchList'

export function Home() {
  const [tab, setTab] = useState<'ranking' | 'partidos'>('ranking')

  return (
    <main className="max-w-5xl mx-auto px-4 pb-12">
      {/* Hero */}
      <div className="relative text-center py-8 overflow-hidden select-none">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: '18rem', opacity: 0.025, lineHeight: 1 }}>⚽</span>
        </div>
        <div className="relative">
          <p className="text-[10px] font-semibold text-yellow-400/60 uppercase tracking-[0.45em] mb-3">
            ⚽ &nbsp; Polla Gorettiana &nbsp; · &nbsp; Junio 2026
          </p>
          <h1 className="font-display gradient-text leading-none tracking-widest" style={{ fontSize: 'clamp(3rem, 12vw, 7rem)' }}>
            MUNDIAL<br />2026
          </h1>
          <p className="text-slate-600 text-xs tracking-[0.3em] uppercase mt-4">
            Clasificación en Tiempo Real
          </p>
        </div>
      </div>

      {/* Tabs — solo visibles en móvil */}
      <div className="flex lg:hidden gap-2 mb-4">
        <button
          onClick={() => setTab('ranking')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 flex items-center justify-center gap-2 ${
            tab === 'ranking'
              ? 'bg-yellow-400 text-[#060e1a] shadow-[0_0_16px_rgba(245,197,24,0.3)]'
              : 'bg-white/5 text-slate-400 border border-white/10'
          }`}
        >
          🏆 Ranking
        </button>
        <button
          onClick={() => setTab('partidos')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 flex items-center justify-center gap-2 ${
            tab === 'partidos'
              ? 'bg-yellow-400 text-[#060e1a] shadow-[0_0_16px_rgba(245,197,24,0.3)]'
              : 'bg-white/5 text-slate-400 border border-white/10'
          }`}
        >
          ⚽ Partidos
        </button>
      </div>

      {/* Content — grid en desktop, tabs en móvil */}
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className={tab === 'ranking' ? 'block' : 'hidden lg:block'}>
          <RankingTable />
        </div>
        <div className={tab === 'partidos' ? 'block' : 'hidden lg:block'}>
          <MatchList />
        </div>
      </div>
    </main>
  )
}
