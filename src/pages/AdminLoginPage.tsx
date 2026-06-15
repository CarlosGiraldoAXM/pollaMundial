import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminLogin } from '../components/AdminLogin'
import { useAuth } from '../hooks/useAuth'

export function AdminLoginPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin', { replace: true })
    }
  }, [isAuthenticated, navigate])

  return <AdminLogin />
}
