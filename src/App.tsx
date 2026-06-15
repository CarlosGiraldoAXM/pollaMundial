import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Header } from './components/Header'
import { Home } from './pages/Home'
import { PlayerPage } from './pages/PlayerPage'
import { Admin } from './pages/Admin'
import { AdminLoginPage } from './pages/AdminLoginPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--navy)' }}>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jugador/:name" element={<PlayerPage />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
