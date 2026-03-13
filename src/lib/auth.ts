const TOKEN_KEY         = 'fitapp_token'
const REFRESH_TOKEN_KEY = 'fitapp_refresh_token'
const USER_KEY          = 'fitapp_user'

export interface StoredUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as StoredUser } catch { return null }
}

export function saveAuth(token: string, refreshToken: string, user: StoredUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function updateTokens(token: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
