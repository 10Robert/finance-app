import axios from 'axios'

export interface AuthUser {
  id: number
  email: string
  name: string
  is_active: boolean
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

const TOKEN_KEY = 'obsidian-finance-token'

// Shared axios instance used by every API call in the app.
export const api = axios.create({ baseURL: '/api' })

// Attach the bearer token (and a 401 handler) once at module load. Other
// modules just import { api } and the token is already wired.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // Token rejected — drop it. AuthContext will react via storage event /
      // its /me revalidation on next mount.
      const hadToken = !!localStorage.getItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('obsidian-finance-user')
      if (hadToken && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(err)
  },
)

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),
  register: (email: string, name: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, name, password }).then((r) => r.data),
  me: () => api.get<AuthUser>('/auth/me').then((r) => r.data),
}
