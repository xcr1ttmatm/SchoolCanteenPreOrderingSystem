import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Squiggle } from '../../components/ui'
import { useAuth } from '../../context/useAuth'
import { money } from '../../lib/format'
import { fetchTodayMenu, resetTodayMenu, saveDailyEntry } from '../../lib/menu'

export default function StaffAvailability() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [hasBoard, setHasBoard] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
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
