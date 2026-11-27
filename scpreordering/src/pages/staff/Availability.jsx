import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LockKeyhole, UnlockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '../../components/Modal'
import { Squiggle } from '../../components/ui'
import { useAuth } from '../../context/useAuth'
import { useCanteenStatus } from '../../context/useCanteenStatus'
import { money } from '../../lib/format'
import { fetchTodayMenu, resetTodayMenu, saveDailyEntry } from '../../lib/menu'

export default function StaffAvailability() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [hasBoard, setHasBoard] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const [closingReason, setClosingReason] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const { isOpen, reason, loading: statusLoading, error: statusError, changeStatus } = useCanteenStatus()
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  })

  const load = async () => {
    try {
      const result = await fetchTodayMenu()
      setItems(result.items)
      setHasBoard(result.hasBoard)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const update = async (item, patch) => {
    setSavingId(item.id)
    try {
      await saveDailyEntry({ menuItemId: item.id, patch, userId: profile?.id })
      setItems((current) => current.map((row) => (
        row.id === item.id ? { ...row, ...patch, onTodayBoard: true } : row
      )))
      setHasBoard(true)
      toast.success(`${item.name} updated for today`)
    } catch (error) {
      toast.error(error.message)
      load()
    } finally {
      setSavingId(null)
    }
  }

  const reset = async () => {
    if (!window.confirm('Clear today\'s board and go back to the usual menu?')) return
    try {
      await resetTodayMenu()
      await load()
      toast.success('Today\'s board reset to the usual menu')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const applyStatusChange = async () => {
    setSavingStatus(true)
    try {
      await changeStatus(!isOpen, isOpen ? closingReason : null)
      toast.success(
        isOpen
          ? 'Counter closed. New orders are paused.'
          : 'Counter open. Students can order again.',
      )
      setConfirmStatus(false)
      setClosingReason('')
    } catch (error) {
      toast.error(error.message || 'Could not update the counter status.')
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">The board · {today}</span>
          <h1 className="greeting">What's for sale today?</h1>
          <Squiggle />
          <p className="status-line">
            Set today's availability and stock. Today's stock overrides the usual menu; tomorrow starts fresh.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-quiet" onClick={reset} disabled={loading}>
            Reset to usual
          </button>
          <Link to="/staff" className="btn btn-quiet">Back to the queue</Link>
        </div>
      </div>

      {!loading && !hasBoard && (
        <div className="notice mb-24">
          No board posted yet for today. Students are seeing the usual menu until you change something below.
        </div>
      )}

      <section className="hard-card canteen-control">
        <div className="row between">
          <div>
            <span className="tiny-label">Counter status</span>
            <h2 className="section-title mt-8">Taking new orders?</h2>
            <p className="stat-context">
              Closing pauses new orders. Orders already placed can still be paid and processed.
            </p>
          </div>
          <span className={`tag ${isOpen ? 'sage' : 'tomato'}`}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {statusError && (
          <p className="error-text mt-16">
            {statusError} Run the latest counter-status SQL script in Supabase to enable this control.
          </p>
        )}

        {isOpen ? (
          <div className="field mt-16">
            <label className="tiny-label" htmlFor="closedReason">Message for students (optional)</label>
            <input
              id="closedReason"
              className="input"
              value={closingReason}
              maxLength={160}
              placeholder="e.g. Out for lunch, back at 1:00"
              onChange={(event) => setClosingReason(event.target.value)}
            />
          </div>
        ) : (
          reason && <p className="notice mt-16">Students see: “{reason}”</p>
        )}

        <button
          type="button"
          className={`btn ${isOpen ? 'btn-quiet' : 'btn-primary'} mt-16`}
          disabled={statusLoading || Boolean(statusError)}
          onClick={() => setConfirmStatus(true)}
        >
          {isOpen
            ? <><LockKeyhole size={16} aria-hidden="true" /> Close counter</>
            : <><UnlockKeyhole size={16} aria-hidden="true" /> Reopen counter</>}
        </button>

        <ConfirmDialog
          open={confirmStatus}
          onClose={() => { if (!savingStatus) setConfirmStatus(false) }}
          onConfirm={applyStatusChange}
          title={isOpen ? 'Close the counter?' : 'Reopen the counter?'}
          message={
            isOpen
              ? 'Students will see a closed banner and the order buttons will be disabled. Orders already placed can still be paid and prepared. You can reopen at any time.'
              : 'Students will be able to browse and place new orders again right away.'
          }
          confirmLabel={isOpen ? 'Yes, close counter' : 'Yes, reopen counter'}
          cancelLabel={isOpen ? 'Keep it open' : 'Keep it closed'}
          busy={savingStatus}
        />
      </section>

      <section className="hard-card">
        <div className="row between">
          <div>
            <span className="tiny-label">Food on the menu</span>
            <h2 className="section-title mt-8">Today's availability &amp; stock</h2>
            <p className="stat-context">Today's stock overrides the usual stock set on the Menu page.</p>
          </div>
          <span className="tag sage">{items.filter((item) => item.available && item.stock > 0).length} on sale</span>
        </div>
        {loading ? (
          <p className="muted">Reading the board…</p>
        ) : (
          <>
            <p className="swipe-hint">Swipe sideways to see every column →</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Today's board table, scroll horizontally">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Category</th>
                    <th scope="col">Price</th>
                    <th scope="col">Available</th>
                    <th scope="col">Stock left today</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="stat-context">{item.onTodayBoard ? "On today's board" : 'Usual menu'}</div>
                      </td>
                      <td>{item.category}</td>
                      <td>{money(item.price)}</td>
                      <td>
                        <label className="row" style={{ gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={item.available}
                            disabled={savingId === item.id}
                            onChange={(event) => update(item, { available: event.target.checked })}
                            aria-label={`${item.name} available`}
                          />
                          <span>{item.available ? 'Yes' : 'No'}</span>
                        </label>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="input"
                          style={{ width: 90, maxWidth: '100%', minHeight: 38 }}
                          value={item.stock}
                          disabled={savingId === item.id}
                          onChange={(event) => setItems((current) => current.map((row) => (
                            row.id === item.id ? { ...row, stock: Number(event.target.value) } : row
                          )))}
                          onBlur={(event) => update(item, { stock: Math.max(0, Number(event.target.value) || 0) })}
                          aria-label={`${item.name} stock for today`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  )
}
