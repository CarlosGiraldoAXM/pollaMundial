import { useParams, Link } from 'react-router-dom'
import { PlayerDetail } from '../components/PlayerDetail'

export function PlayerPage() {
  const { name } = useParams<{ name: string }>()
  const decoded = name ? decodeURIComponent(name) : ''

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-400 transition-colors text-sm mb-6"
      >
        ← Volver al ranking
      </Link>

      <PlayerDetail name={decoded} />
    </main>
  )
}
