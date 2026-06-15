import { Link, useLocation } from 'react-router-dom'

export function Header() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  return (
    <header className="sticky top-0 z-50" style={{ background: 'rgba(6,14,26,0.92)', backdropFilter: 'blur(20px)' }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 10px rgba(245,197,24,0.5))' }}>🏆</span>
          <div>
            <p className="font-display text-lg text-yellow-400 leading-none tracking-widest group-hover:text-yellow-300 transition-colors">
              POLLA GORETTIANA
            </p>
            <p className="text-[9px] text-slate-600 uppercase tracking-[0.25em] leading-none mt-0.5">
              Mundial FIFA 2026
            </p>
          </div>
        </Link>

        <nav>
          {!isAdmin && (
            <Link to="/admin" className="text-xs text-slate-600 hover:text-yellow-400 transition-colors px-3 py-1.5 border border-transparent hover:border-yellow-400/20 rounded-lg">
              Admin
            </Link>
          )}
          {isAdmin && (
            <Link to="/" className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5">
              ← Ranking
            </Link>
          )}
        </nav>
      </div>
      {/* Gold accent line */}
      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(245,197,24,0.4), rgba(245,197,24,0.1), transparent)' }} />
    </header>
  )
}
