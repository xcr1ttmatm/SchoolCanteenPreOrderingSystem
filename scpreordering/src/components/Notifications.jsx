import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/useAuth'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  watchNotifications,
} from '../lib/notifications'

const MAX_NOTIFICATIONS = 40

const timeLabel = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const sortNewest = (rows) =>
  [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, MAX_NOTIFICATIONS)

export function Notifications() {
  const { profile } = useAuth()
  const userId = profile?.id
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const wrapRef = useRef(null)

  const handleInsert = useCallback((row) => {
    setNotifications((current) => {
      if (current.some((item) => item.id === row.id)) return current
      return sortNewest([row, ...current])
    })
    toast.success(`${row.title}: ${row.body}`)
  }, [])

  const handleUpdate = useCallback((row) => {
    setNotifications((current) =>
      current.map((item) => (item.id === row.id ? { ...item, ...row } : item)),
    )
  }, [])

  useEffect(() => {
    setNotifications([])
    if (!userId) return undefined

    let active = true
    setLoading(true)

    fetchNotifications(userId)
      .then((rows) => {
        if (!active) return
        setNotifications((current) => {
          const merged = new Map(rows.map((row) => [row.id, row]))
          current.forEach((row) => merged.set(row.id, row))
          return sortNewest([...merged.values()])
        })
      })
      .catch(() => {
        // Keep the bell usable if the first load fails; realtime may still arrive.
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = watchNotifications(userId, {
      onInsert: handleInsert,
      onUpdate: handleUpdate,
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [userId, handleInsert, handleUpdate])

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const readOne = async (item) => {
    if (item.read_at) return
    setBusyId(item.id)
    try {
      await markNotificationRead(item.id)
      const now = new Date().toISOString()
      setNotifications((current) =>
        current.map((row) => (row.id === item.id ? { ...row, read_at: row.read_at ?? now } : row)),
      )
    } catch (error) {
      toast.error(error.message || 'Could not mark this notification as read.')
    } finally {
      setBusyId(null)
    }
  }

  const readAll = async () => {
    setBusyId('all')
    try {
      await markAllNotificationsRead(userId)
      const now = new Date().toISOString()
      setNotifications((current) =>
        current.map((row) => ({ ...row, read_at: row.read_at ?? now })),
      )
    } catch (error) {
      toast.error(error.message || 'Could not mark notifications as read.')
    } finally {
      setBusyId(null)
    }
  }

  const unread = notifications.filter((item) => !item.read_at).length

  return (
    <div className="notification-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-button notification-bell"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown" role="dialog" aria-label="Notifications">
          <div className="notification-head">
            <div>
              <span className="tiny-label">Activity</span>
              <strong>Notifications</strong>
            </div>
            {unread > 0 && (
              <button
                type="button"
                className="link-button"
                disabled={busyId === 'all'}
                onClick={readAll}
              >
                <CheckCheck size={14} aria-hidden="true" />{' '}
                {busyId === 'all' ? 'Updating…' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading && <p className="notification-empty">Checking for updates…</p>}
            {!loading && notifications.length === 0 && (
              <p className="notification-empty">You're all caught up.</p>
            )}
            {notifications.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`notification-item${item.read_at ? '' : ' unread'}`}
                disabled={busyId === item.id}
                onClick={() => readOne(item)}
              >
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <span className="notification-time">{timeLabel(item.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
