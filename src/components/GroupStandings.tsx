import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchOFBMatches, getOFBCacheSnapshot } from '../lib/openfootball'
import { computeGroupStandings } from '../lib/groupStandings'
import { computeTopScorers } from '../lib/scorers'
import type { GroupStanding, TeamStanding } from '../lib/groupStandings'
import type { TopScorer } from '../lib/scorers'
import { getFlagUrl } from '../constants/flagEmoji'

function FlagImg({ team, size = 22 }: { team: string; size?: number }) {
  const url = getFlagUrl(team)
  if (!url) {
    return <span className="text-slate-500 text-[10px] font-bold shrink-0" style={{ width: size }}>{team.slice(0, 3)}</span>
  }
  return (
    <img
      src={url}
      alt={team}
      className="object-cover rounded-sm shrink-0"
      style={{ width: size, height: Math.round(size * 0.68) }}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// Top 2 qualify directly; best 8 third-place also advance in the 2026 WC format
function posColor(pos: number) {
  if (pos <= 2) return 'border-l-2 border-emerald-500'
  if (pos === 3) return 'border-l-2 border-amber-500/60'
  return 'border-l-2 border-transparent'
}

function PosDot({ pos }: { pos: number }) {
  if (pos <= 2) return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
  if (pos === 3) return <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
  return <span className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
}

function GdCell({ gd }: { gd: number }) {
  const cls = gd > 0 ? 'text-emerald-400' : gd < 0 ? 'text-red-400/80' : 'text-slate-500'
  return <span className={`w-8 text-xs text-center tabular-nums ${cls}`}>{gd > 0 ? `+${gd}` : gd}</span>
}

function TeamRow({ s, pos }: { s: TeamStanding; pos: number }) {
  return (
    <div className={`flex items-center gap-1.5 py-2.5 px-3 hover:bg-white/[0.03] transition-colors ${posColor(pos)}`}>
      <div className="flex items-center justify-center w-4"><PosDot pos={pos} /></div>
      <span className="w-4 text-xs text-slate-600 tabular-nums text-center shrink-0">{pos}</span>
      <FlagImg team={s.team} />
      <span className="flex-1 text-sm text-white truncate min-w-0 font-medium">{s.team}</span>
      <div className="flex items-center gap-0 shrink-0">
        <span className="w-7 text-xs text-center tabular-nums text-slate-400">{s.played}</span>
        <span className="w-6 text-xs text-center tabular-nums text-emerald-400">{s.won}</span>
        <span className="w-6 text-xs text-center tabular-nums text-slate-500">{s.drawn}</span>
        <span className="w-6 text-xs text-center tabular-nums text-red-400/70">{s.lost}</span>
        <span className="hidden sm:block w-6 text-xs text-center tabular-nums text-slate-400">{s.gf}</span>
        <span className="hidden sm:block w-6 text-xs text-center tabular-nums text-slate-400">{s.ga}</span>
        <GdCell gd={s.gd} />
        <span className="w-7 text-sm font-bold text-right tabular-nums text-yellow-400">{s.points}</span>
      </div>
    </div>
  )
}

function GroupTable({ standing }: { standing: GroupStanding }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5">
        <div className="w-4" /><span className="w-4" /><span className="w-[22px]" />
        <span className="flex-1 text-[10px] text-slate-600 uppercase tracking-wider">Equipo</span>
        <div className="flex items-center gap-0 shrink-0">
          <span className="w-7 text-[10px] text-slate-600 uppercase tracking-wider text-center">PJ</span>
          <span className="w-6 text-[10px] text-slate-600 uppercase tracking-wider text-center">G</span>
          <span className="w-6 text-[10px] text-slate-600 uppercase tracking-wider text-center">E</span>
          <span className="w-6 text-[10px] text-slate-600 uppercase tracking-wider text-center">P</span>
          <span className="hidden sm:block w-6 text-[10px] text-slate-600 uppercase tracking-wider text-center">GF</span>
          <span className="hidden sm:block w-6 text-[10px] text-slate-600 uppercase tracking-wider text-center">GC</span>
          <span className="w-8 text-[10px] text-slate-600 uppercase tracking-wider text-center">DG</span>
          <span className="w-7 text-[10px] text-slate-600 uppercase tracking-wider text-right">Pts</span>
        </div>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {standing.teams.map((t, i) => <TeamRow key={t.team} s={t} pos={i + 1} />)}
      </div>
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function ScorerRow({ scorer, rank }: { scorer: TopScorer; rank: number }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-white/[0.03] transition-colors">
      <div className="w-8 text-center shrink-0">
        {rank <= 3
          ? <span className="text-xl leading-none">{MEDALS[rank - 1]}</span>
          : <span className="text-slate-600 font-mono text-sm">{rank}</span>
        }
      </div>
      <FlagImg team={scorer.team} size={20} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{scorer.name}</p>
        <p className="text-[10px] text-slate-500 truncate">{scorer.team}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-display text-2xl text-yellow-400 tabular-nums leading-none">{scorer.goals}</span>
        {scorer.penalties > 0 && (
          <span className="text-[10px] text-slate-500 bg-white/5 border border-white/10 rounded px-1 py-0.5">
            {scorer.penalties}p
          </span>
        )}
      </div>
    </div>
  )
}

function ScorerList({ scorers }: { scorers: TopScorer[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? scorers : scorers.slice(0, 15)

  if (scorers.length === 0) {
    return (
      <div className="py-12 text-center text-slate-600">
        <p className="text-3xl mb-2">⚽</p>
        <p className="text-sm">Todavía no hay goles registrados.</p>
      </div>
    )
  }

  // Assign real ranks (ties share rank)
  const ranked: { scorer: TopScorer; rank: number }[] = []
  let currentRank = 1
  for (let i = 0; i < visible.length; i++) {
    if (i > 0 && visible[i].goals < visible[i - 1].goals) currentRank = i + 1
    ranked.push({ scorer: visible[i], rank: currentRank })
  }

  return (
    <div>
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-white/5">
        <span className="w-8 text-[10px] text-slate-600 uppercase tracking-wider text-center">#</span>
        <span className="w-5" />
        <span className="flex-1 text-[10px] text-slate-600 uppercase tracking-wider">Jugador</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider pr-1">Goles</span>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {ranked.map(({ scorer, rank }) => (
          <ScorerRow key={`${scorer.name}::${scorer.team}`} scorer={scorer} rank={rank} />
        ))}
      </div>
      {!showAll && scorers.length > 15 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2.5 text-xs text-slate-500 hover:text-yellow-400 border-t border-white/5 transition-colors"
        >
          Ver {scorers.length - 15} más ↓
        </button>
      )}
    </div>
  )
}

type SubView = 'grupos' | 'goleadores'

export function GroupStandings() {
  const [subView, setSubView] = useState<SubView>('grupos')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const { data: apiMatches = [], isLoading, isFetching } = useQuery({
    queryKey: ['ofb-matches'],
    queryFn: () => fetchOFBMatches(),
    staleTime: 2 * 60 * 60 * 1000,
    refetchInterval: 2 * 60 * 60 * 1000,
    gcTime: 3 * 60 * 60 * 1000,
    initialData: () => getOFBCacheSnapshot()?.data,
    initialDataUpdatedAt: () => getOFBCacheSnapshot()?.ts ?? 0,
    placeholderData: prev => prev,
  })

  const groups = computeGroupStandings(apiMatches)
  const scorers = computeTopScorers(apiMatches)

  const activeGroup = selectedGroup ?? groups[0]?.group ?? null
  const standing = groups.find(g => g.group === activeGroup)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">📊</span>
          <div>
            <h2 className="font-display text-xl tracking-widest text-yellow-400 leading-none">GRUPOS</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
              {subView === 'grupos'
                ? `Clasificación fase de grupos · ${groups.length} grupos`
                : `${scorers.length} goleadores · ${scorers.reduce((s, g) => s + g.goals, 0)} goles`
              }
              {isFetching && !isLoading && (
                <span className="ml-2 text-slate-700 animate-pulse">· actualizando…</span>
              )}
            </p>
          </div>
        </div>

        {/* Sub-view toggle */}
        <div className="flex gap-2 mb-3">
          {(['grupos', 'goleadores'] as SubView[]).map(v => (
            <button
              key={v}
              onClick={() => setSubView(v)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                subView === v
                  ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30'
                  : 'text-slate-500 border border-white/8 hover:border-white/20'
              }`}
            >
              {v === 'grupos' ? '📋 Tabla de grupos' : '⚽ Goleadores'}
            </button>
          ))}
        </div>

        {/* Group selector — only in grupos view */}
        {subView === 'grupos' && (
          isLoading ? (
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="w-8 h-7 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {groups.map(g => (
                <button
                  key={g.group}
                  onClick={() => setSelectedGroup(g.group)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all duration-150 min-w-[2rem] ${
                    g.group === activeGroup
                      ? 'bg-yellow-400 text-[#060e1a] border-yellow-400 shadow-[0_0_12px_rgba(245,197,24,0.3)]'
                      : 'border-white/10 text-slate-400 hover:border-yellow-400/30 hover:text-yellow-400/80'
                  }`}
                >
                  {g.group}
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/4 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : subView === 'grupos' ? (
        standing ? (
          <div>
            <div className="px-5 py-2 bg-white/[0.02] border-b border-white/5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Grupo {standing.group}</span>
            </div>
            <GroupTable standing={standing} />
          </div>
        ) : (
          <div className="py-12 text-center text-slate-600">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-sm">No hay datos de grupos todavía.</p>
          </div>
        )
      ) : (
        <ScorerList scorers={scorers} />
      )}

      {/* Legend — only in grupos view */}
      {subView === 'grupos' && standing && (
        <div className="px-4 py-2.5 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Clasifica directo (Top 2)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" /> Posible clasificado (mejor 3ro)
          </span>
        </div>
      )}
    </div>
  )
}
