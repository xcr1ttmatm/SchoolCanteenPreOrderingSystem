import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Notifications } from '../../components/Notifications'
import { EmptyState, Squiggle, StatCard, StatusTag, StickyNote, ThroughputChart } from '../../components/ui'
import { useAuth } from '../../context/useAuth'
import { activeStatuses, firstName, greetingForHour, money, pickupLabel } from '../../lib/format'
import { fetchMyOrders, isToday, itemSummary, watchOrders, weekCounts } from '../../lib/orders'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.id) return
    try {
      setOrders(await fetchMyOrders(profile.id))
    } catch {
      // Keep the page usable if a refresh fails.
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    load()
    if (!profile?.id) return undefined
    return watchOrders(() => load(), `user_id=eq.${profile.id}`)
  }, [load, profile])

  const open = orders.filter((order) => activeStatuses.includes(order.status))
  const ready = orders.filter((order) => order.status === 'ready')
  const spent = orders
    .filter((order) => order.payment_status === 'paid')
    .reduce((sum, order) => sum + Number(order.total), 0)
  const recent = orders.slice(0, 5)

  const statusLine = ready.length
    ? `${ready.length} order${ready.length === 1 ? '' : 's'} ready and waiting at the counter. Go get it while it's warm.`
    : open.length
      ? `${open.length} order${open.length === 1 ? '' : 's'} in the queue. We'll show you the moment it's ready.`
      : 'No orders in the queue yet. Lunch is only a few taps away.'

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">SPC Canteen · Today</span>
          <h1 className="greeting">{greetingForHour()}, {firstName(profile?.full_name)}.</h1>
          <Squiggle />
          <p className="status-line">{statusLine}</p>
        </div>
        <Link to="/menu" className="btn btn-primary">
          Order lunch <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>

      <section className="hard-card">
        <div className="section-head-row">
          <div>
            <span className="tiny-label">The ledger</span>
            <h2 className="section-title mt-8">Lately at the counter</h2>
          </div>
          <Notifications />
        </div>
        {loading ? (
          <p className="muted">Checking your orders…</p>
        ) : recent.length === 0 ? (
          <EmptyState title="No orders yet" hint="Your first order will show up right here." />
        ) : (
          <>
          <p className="swipe-hint">Swipe sideways to see every column →</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent orders table, scroll horizontally">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">What</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.order_number}</strong></td>
                    <td>{itemSummary(order)}</td>
                    <td><StatusTag status={order.status} /></td>
                    <td>{pickupLabel(order.pickup_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <div className="stats">
        <StatCard
          label="Open orders"
          value={loading ? '…' : open.length}
          context={open.length ? `${open.filter((o) => isToday(o.created_at)).length} placed today` : 'Nothing waiting'}
          tone="sage"
        />
        <StatCard
          label="Ready for pickup"
          value={loading ? '…' : ready.length}
          context={ready.length ? 'Head to the counter' : 'We will let you know'}
          tone="mustard"
        />
        <StatCard
          label="Paid so far"
          value={loading ? '…' : money(spent)}
          context="All your confirmed orders"
          tone="paper"
        />
      </div>

      <div className="split">
        <ThroughputChart data={weekCounts(orders)} title="Your orders this week" />
        <StickyNote
          title="Don't forget"
          items={[
            'Pick up at the canteen counter before 12:30 PM.',
            'Show your order number — no need to queue again.',
            'Soup sells out first. Order early if that is your thing.',
          ]}
        />
      </div>
    </>
  )
}
