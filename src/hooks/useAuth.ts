import { useState, useCallback } from 'react'

const TOKEN_KEY = 'polla_admin_token'
const VALID_TOKEN = 'polla_admin_authenticated'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem(TOKEN_KEY) === VALID_TOKEN
  })

  const login = useCallback((user: string, password: string): boolean => {
    const validUser = import.meta.env.VITE_ADMIN_USER ?? 'admin'
    const validPass = import.meta.env.VITE_ADMIN_PASSWORD ?? 'admin'

    if (user === validUser && password === validPass) {
      localStorage.setItem(TOKEN_KEY, VALID_TOKEN)
      setIsAuthenticated(true)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setIsAuthenticated(false)
  }, [])

  return { isAuthenticated, login, logout }
}
