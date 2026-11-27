import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCanteenStatus, setCanteenStatus, watchCanteenStatus } from '../lib/canteen'
import { CanteenContext } from './canteenContext'

export default function CanteenStatusProvider({ children }) {
  const [status, setStatus] = useState({ isOpen: true, reason: null, updatedAt: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchCanteenStatus())
      setError(null)
    } catch (err) {
      setError(err.message || 'Could not load the counter status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const stopWatching = watchCanteenStatus(() => { refresh() })
    return stopWatching
  }, [refresh])

  const changeStatus = useCallback(async (open, reason) => {
    await setCanteenStatus(open, reason)
    await refresh()
  }, [refresh])

  const value = useMemo(() => ({
    ...status,
    loading,
    error,
    refresh,
    changeStatus,
  }), [status, loading, error, refresh, changeStatus])

  return <CanteenContext.Provider value={value}>{children}</CanteenContext.Provider>
}
