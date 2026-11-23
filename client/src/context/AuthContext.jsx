import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, setUnauthorizedHandler } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 'loading' until we know whether the cookie holds a valid session.
  const [status, setStatus] = useState('loading')

  // Restore session on page load: the cookie is httpOnly, so we can't inspect
  // it from JS — we ask the API who we are instead.
  useEffect(() => {
    authApi
      .me()
      .then((u) => {
        setUser(u)
        setStatus('authenticated')
      })
      .catch(() => setStatus('anonymous'))
  }, [])

  // If any request returns 401 (token expired / revoked), drop to logged-out.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setStatus('anonymous')
    })
    return () => setUnauthorizedHandler(() => {})
  }, [])

  const login = useCallback(async (credentials) => {
    const u = await authApi.login(credentials)
    setUser(u)
    setStatus('authenticated')
  }, [])

  const signup = useCallback(async (data) => {
    const u = await authApi.signup(data)
    setUser(u)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const value = useMemo(() => ({ user, status, login, signup, logout }), [user, status, login, signup, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
