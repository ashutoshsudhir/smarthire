import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from './api'

/** Small data-fetching hook: { data, error, loading, reload, setData }. */
export function useApi(url, { params, enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const key = JSON.stringify([url, params])
  const reqId = useRef(0)

  const load = useCallback(async (silent = false) => {
    if (!enabled || !url) return
    const id = ++reqId.current
    if (!silent) setLoading(true)
    setError(null)
    try {
      const r = await api.get(url, { params })
      if (id === reqId.current) setData(r.data)
    } catch (e) {
      if (id === reqId.current) setError(errorMessage(e))
    } finally {
      if (id === reqId.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  useEffect(() => { load() }, [load])

  return { data, error, loading, reload: load, setData }
}
