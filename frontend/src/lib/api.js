import axios from 'axios'

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'smarthire.token'

export const tokenStore = {
  // sessionStorage: token is scoped to the tab (lets you demo admin + candidate side by side)
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { sessionStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

export const api = axios.create({ baseURL: API_URL, timeout: 90_000 })

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      tokenStore.clear()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1')
      }
    }
    return Promise.reject(error)
  },
)

export function errorMessage(err, fallback = 'Something went wrong') {
  if (!err) return fallback
  if (err.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.'
  if (!err.response) return 'Cannot reach the SmartHire server. Check your connection and try again.'
  const d = err.response.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join('; ')
  return fallback
}
