import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Eye, RotateCcw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { Notifications } from '../../components/Notifications'
import { EmptyState, Squiggle, StatCard, StatusTag, StickyNote, ThroughputChart } from '../../components/ui'
import {
  cashWindow,
  canReleaseCashOrder,
  isOpenCashOrder,
} from '../../lib/cashWait'
import { firstName, greetingForHour, money, pickupLabel, statusLabel } from '../../lib/format'
import {
  collectCash,
  declineOrder,
  deleteOrderStaff,
  releaseCashOrder,
  setOrderStatus,
  undoDecline,
  undoStatusChange,
} from '../../lib/checkout'
import { fetchAllOrders, fetchProfiles, isToday, itemSummary, watchOrders, weekCounts } from '../../lib/orders'

const fullStamp = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const canUndoDecline = (order) =>
  order?.status === 'rejected'
  && order?.payment_status === 'unpaid'
  && Boolean(order?.previous_status && order?.declined_by)

const canUndoStatus = (order) =>
  Boolean(order?.last_status)
  && !canUndoDecline(order)
  && order?.status !== 'rejected'
  && order?.last_status !== 'rejected'

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="tiny-label">{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  )
}

function OrderDetails({ order, student }) {
  const payment = order.payments?.[0]
  const items = order.order_items ?? []
  const wait = isOpenCashOrder(order) ? cashWindow(order) : null

  return (
    <>
      <div className="row between">
        <StatusTag status={order.status} />
        <span className={`tag ${order.payment_status === 'paid' ? 'sage' : 'mustard'}`}>
          {order.payment_status === 'paid' ? 'Paid' : 'Not paid yet'}
        </span>
      </div>
      {order.student_deleted_at && (
        <p className="stat-context">Hidden by student at {fullStamp(order.student_deleted_at)}</p>
      )}
      <hr className="divider-dashed" />

      <div className="detail-grid">
        <DetailRow label="Student" value={student?.full_name ?? '—'} />
        <DetailRow label="School ID" value={student?.student_id ?? '—'} />
        <DetailRow label="Pickup" value={pickupLabel(order.pickup_time)} />
        <DetailRow label="Placed" value={fullStamp(order.created_at)} />
        <DetailRow
          label="Payment method"
          value={order.payment_method === 'cash' ? 'Cash at canteen' : 'Online'}
        />
        <DetailRow label="Payment status" value={order.payment_status === 'paid' ? 'Paid' : 'Not paid yet'} />
        {wait && (
          <DetailRow
            label="Cash pickup window"
            value={wait.expired ? 'Expired' : `${wait.elapsedMinutes} min waiting · ${wait.remainingMinutes} min left`}
          />
        )}
        {order.cash_close_reason && (
          <DetailRow label="Cash close reason" value={order.cash_close_reason.replaceAll('_', ' ')} />
        )}
        {payment?.verified_at && <DetailRow label="Paid at" value={fullStamp(payment.verified_at)} />}
        {order.completed_at && <DetailRow label="Completed by" value={order.completed_by_name ?? '—'} />}
        {order.completed_at && <DetailRow label="Completed at" value={fullStamp(order.completed_at)} />}
        {order.declined_at && <DetailRow label="Declined at" value={fullStamp(order.declined_at)} />}
        {order.undone_at && <DetailRow label="Decline undone" value={fullStamp(order.undone_at)} />}
      </div>

      {order.notes && (
        <div className="detail-note mt-16">
          <span className="tiny-label">Note for the counter</span>
          <p style={{ margin: '6px 0 0' }}>{order.notes}</p>
        </div>
      )}

      <span className="tiny-label mt-16">Everything ordered</span>
      <ul className="detail-items">
        {items.length === 0 ? (
          <li className="muted">No items recorded for this order.</li>
        ) : (
          items.map((item) => (
            <li className="detail-item" key={item.id}>
              <div>
                <strong>{item.name_snapshot}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {money(item.unit_price)} × {item.quantity}
                </div>
              </div>
              <strong>{money(item.unit_price * item.quantity)}</strong>
            </li>
          ))
        )}
      </ul>

      <div className="detail-total">
        <span className="tiny-label">Total</span>
        <strong className="price">{money(order.total)}</strong>
      </div>
    </>
  )
}

export default function StaffQueue() {
  const [orders, setOrders] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [pendingDecline, setPendingDecline] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingCashAction, setPendingCashAction] = useState(null)
  const [detailsId, setDetailsId] = useState(null)
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const [orderRows, profileRows] = await Promise.all([fetchAllOrders(), fetchProfiles()])
      setOrders(orderRows)
      setProfiles(Object.fromEntries(profileRows.map((row) => [row.id, row])))
    } catch {
      // A failed refresh should not wipe the current view.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    return watchOrders(() => load())
  }, [load])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const setStatus = async (order, status) => {
    setBusy(order.id)
    try {
      await setOrderStatus(order.id, status)
      toast.success(`${order.order_number} → ${statusLabel(status).toLowerCase()}`)
      await load()
      return true
    } catch (error) {
      toast.error(error.message || 'Could not update the order.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const takeCash = async (order) => {
    setBusy(order.id)
    try {
      await collectCash(order.id)
      toast.success(`${order.order_number} paid. It's being prepared now.`)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not confirm payment.')
    } finally {
      setBusy(null)
    }
  }

  const runUndo = async (order, action, message) => {
    setBusy(order.id)
    try {
      await action()
      toast.success(message)
      setPendingDecline((current) => (current?.id === order.id ? null : current))
      setDetailsId((current) => (current === order.id ? null : current))
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not undo that change.')
    } finally {
      setBusy(null)
    }
  }

  const undo = async (order) => {
    if (canUndoDecline(order)) {
      await runUndo(
        order,
        () => undoDecline(order.id),
        `${order.order_number} restored to the queue.`,
      )
      return
    }

    await runUndo(
      order,
      () => undoStatusChange(order.id),
      `${order.order_number} returned to ${statusLabel(order.last_status).toLowerCase()}.`,
    )
  }

  const undoDeclineFromToast = (order) =>
    runUndo(order, () => undoDecline(order.id), `${order.order_number} restored to the queue.`)

  const decline = async () => {
    const order = pendingDecline
    if (!order) return

    setBusy(order.id)
    try {
      await declineOrder(order.id)
      toast.success(
        (toastId) => (
          <span>
            {order.order_number} declined.{' '}
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.dismiss(toastId)
                undoDeclineFromToast(order)
              }}
            >
              Undo
            </button>
          </span>
        ),
        { duration: 8000 },
      )
      setPendingDecline(null)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not decline the order.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    const order = pendingDelete
    if (!order) return

    setBusy(order.id)
    try {
      await deleteOrderStaff(order.id)
      toast.success(`${order.order_number} deleted.`)
      setPendingDelete(null)
      setDetailsId((current) => (current === order.id ? null : current))
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not delete the order.')
    } finally {
      setBusy(null)
    }
  }

  const releaseCash = async () => {
    const target = pendingCashAction
    if (!target) return

    setBusy(target.order.id)
    try {
      await releaseCashOrder(target.order.id, target.action)
      toast.success(
        target.action === 'release'
          ? `${target.order.order_number} released. Another student can order those portions.`
          : `${target.order.order_number} cancelled as a no-show.`,
      )
      setPendingCashAction(null)
      setDetailsId((current) => (current === target.order.id ? null : current))
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not close this cash order.')
    } finally {
      setBusy(null)
    }
  }

  const detailsOrder = orders.find((order) => order.id === detailsId) ?? null
  const normalizedSearch = search.trim().toLowerCase().replace(/\s+/g, '')
  const filteredOrders = useMemo(() => {
    if (!normalizedSearch) return orders
    const needle = normalizedSearch.replace(/-/g, '')
    return orders.filter((order) =>
      [order.order_number, order.id].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .replace(/[\s-]/g, '')
          .includes(needle),
      ),
    )
  }, [orders, normalizedSearch])
  const waiting = orders.filter((order) => ['pending', 'accepted', 'payment'].includes(order.status) && order.payment_status === 'unpaid')
  const preparing = orders.filter((order) => order.status === 'preparing')
  const ready = orders.filter((order) => order.status === 'ready')
  const collected = orders.filter((order) => order.payment_status === 'paid' && isToday(order.created_at))
    .reduce((sum, order) => sum + Number(order.total), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">SPC Canteen · The queue</span>
          <h1 className="greeting">{greetingForHour()}, team.</h1>
          <Squiggle />
          <p className="status-line">
            {waiting.length
              ? `${waiting.length} order${waiting.length === 1 ? '' : 's'} waiting. ${ready.length} ready for pickup.`
              : 'The queue is clear. Enjoy the quiet.'}
          </p>
        </div>
        <Link to="/staff/availability" className="btn btn-primary">
          <ClipboardList size={17} aria-hidden="true" /> Today's board
        </Link>
      </div>

      <section className="hard-card">
        <div className="section-head-row">
          <div>
            <span className="tiny-label">Live from the app</span>
            <h2 className="section-title mt-8">Incoming orders</h2>
          </div>
          <Notifications />
        </div>
        <div className="field queue-search">
          <label className="tiny-label" htmlFor="orderSearch">Find an order by Order ID</label>
          <div className="row">
            <input
              id="orderSearch"
              type="search"
              className="input"
              placeholder="Order number or full reference"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSearch('')}>
                Clear
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <p className="muted">Checking the queue…</p>
        ) : orders.length === 0 ? (
          <EmptyState title="Nothing in the queue" hint="New orders will appear here the moment students place them." />
        ) : filteredOrders.length === 0 ? (
          <EmptyState title="No matching orders" hint="Try the exact Order ID, or clear the search to see the whole queue." />
        ) : (
          <>
            {search && (
              <p className="stat-context">
                Showing {filteredOrders.length} of {orders.length} orders.
              </p>
            )}
            <p className="swipe-hint">Swipe sideways to see every column →</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Order queue table, scroll horizontally">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Student</th>
                    <th scope="col">Items</th>
                    <th scope="col">Pickup</th>
                    <th scope="col">Stage</th>
                    <th scope="col">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const student = profiles[order.user_id]
                    const cash = order.payment_method === 'cash'
                    const wait = isOpenCashOrder(order) ? cashWindow(order, now) : null
                    return (
                      <tr key={order.id}>
                        <td>
                          <button type="button" className="link-button" onClick={() => setDetailsId(order.id)}>
                            <strong>{order.order_number}</strong>
                          </button>
                          <div className="stat-context">{cash ? 'Cash' : 'Online'}{order.payment_status === 'paid' ? ' · paid' : ''}</div>
                          {wait && (
                            <div
                              className="stat-context"
                              style={wait.manual ? { color: '#9c2a16', fontWeight: 700 } : undefined}
                            >
                              {wait.expired
                                ? 'Pickup window expired'
                                : wait.manual
                                  ? `No-show window · ${wait.remainingMinutes} min left`
                                  : `Waiting ${wait.elapsedMinutes} min`}
                            </div>
                          )}
                        </td>
                        <td>
                          {firstName(student?.full_name)}
                          <div className="muted" style={{ fontSize: 12 }}>{student?.student_id || ''}</div>
                        </td>
                        <td>{itemSummary(order)}</td>
                        <td>{pickupLabel(order.pickup_time)}</td>
                        <td>
                          <StatusTag status={order.status} />
                          {order.status === 'rejected' && order.declined_at && (
                            <div className="stat-context">Declined {fullStamp(order.declined_at)}</div>
                          )}
                        </td>
                        <td>
                          <div className="row">
                            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDetailsId(order.id)}>
                              <Eye size={14} aria-hidden="true" /> Details
                            </button>
                            {order.payment_status === 'unpaid' && (
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                aria-label={`Delete ${order.order_number}`}
                                title="Delete unpaid order"
                                disabled={busy === order.id}
                                onClick={() => setPendingDelete(order)}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            )}
                            {canReleaseCashOrder(order, now) && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm"
                                  disabled={busy === order.id}
                                  onClick={() => setPendingCashAction({ order, action: 'cancel' })}
                                >
                                  Cancel no-show
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm"
                                  disabled={busy === order.id}
                                  onClick={() => setPendingCashAction({ order, action: 'release' })}
                                >
                                  Release order
                                </button>
                              </>
                            )}
                            {order.status === 'pending' && (
                              <>
                                {cash && !wait?.expired && (
                                  <button type="button" className="btn btn-quiet btn-sm" disabled={busy === order.id} onClick={() => setStatus(order, 'accepted')}>
                                    Accept
                                  </button>
                                )}
                                {!cash && <span className="muted" style={{ fontSize: 12 }}>Awaiting online payment</span>}
                                <button type="button" className="btn btn-quiet btn-sm" disabled={busy === order.id} onClick={() => setPendingDecline(order)}>
                                  Decline
                                </button>
                              </>
                            )}
                            {order.status === 'accepted' && !wait?.expired && (
                              <button type="button" className="btn btn-quiet btn-sm" disabled={busy === order.id} onClick={() => setStatus(order, 'payment')}>
                                Ask for payment
                              </button>
                            )}
                            {order.status === 'payment' && (
                              cash ? (
                                wait?.expired ? (
                                  <span className="muted" style={{ fontSize: 12 }}>Pickup window expired</span>
                                ) : (
                                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === order.id} onClick={() => takeCash(order)}>
                                    {busy === order.id ? 'Collecting…' : 'Collect cash'}
                                  </button>
                                )
                              ) : (
                                <span className="muted" style={{ fontSize: 12 }}>Waiting for payment</span>
                              )
                            )}
                            {order.status === 'preparing' && (
                              <button type="button" className="btn btn-quiet btn-sm" disabled={busy === order.id} onClick={() => setStatus(order, 'ready')}>
                                Mark ready
                              </button>
                            )}
                            {order.status === 'ready' && (
                              <button type="button" className="btn btn-quiet btn-sm" disabled={busy === order.id} onClick={() => setStatus(order, 'completed')}>
                                Complete
                              </button>
                            )}
                            {canUndoDecline(order) && (
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                disabled={busy === order.id}
                                onClick={() => undo(order)}
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                {busy === order.id ? 'Restoring…' : 'Undo decline'}
                              </button>
                            )}
                            {canUndoStatus(order) && (
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                title={`Return to ${statusLabel(order.last_status)}`}
                                disabled={busy === order.id}
                                onClick={() => undo(order)}
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                {busy === order.id ? 'Undoing…' : 'Undo'}
                              </button>
                            )}
                            {order.status === 'completed' && <span className="muted">Done</span>}
                            {order.status === 'rejected' && !canUndoDecline(order) && <span className="muted">Done</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="stats">
        <StatCard label="Waiting" value={loading ? '…' : waiting.length} context="Payment needed" tone="mustard" />
        <StatCard label="Preparing" value={loading ? '…' : preparing.length} context="Paid and preparing" tone="sage" />
        <StatCard label="Ready" value={loading ? '…' : ready.length} context="On the counter" tone="paper" />
        <StatCard label="Collected today" value={loading ? '…' : money(collected)} context="Paid orders only" tone="blush" />
      </div>

      <div className="split">
        <ThroughputChart data={weekCounts(orders)} title="Orders this week" />
        <StickyNote
          title="Don't forget"
          items={[
            'Nothing is prepared until payment is confirmed — online or cash.',
            'Open Details to see the full order before you act on it.',
            'Mistaken status change? Undo it from the queue or Details.',
            'Unpaid cash orders can be cancelled or released after 15 minutes; they close at 1 hour.',
            'Only unpaid orders can be deleted. Paid orders stay for sales and receipts.',
          ]}
        />
      </div>

      <ConfirmDialog
        open={Boolean(pendingDecline)}
        onClose={() => setPendingDecline(null)}
        onConfirm={decline}
        title={`Decline ${pendingDecline?.order_number ?? 'order'}?`}
        message="The student will see this order as declined. If it was a mistake, you can undo it from the queue."
        confirmLabel="Yes, decline order"
        cancelLabel="Keep order"
        busy={Boolean(pendingDecline) && busy === pendingDecline.id}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        title={`Delete ${pendingDelete?.order_number ?? 'order'}?`}
        message="This permanently removes the unpaid order. No stock was consumed and no payment exists, so no sales record is affected."
        confirmLabel="Delete order"
        cancelLabel="Keep order"
        busy={Boolean(pendingDelete) && busy === pendingDelete.id}
      />

      <ConfirmDialog
        open={Boolean(pendingCashAction)}
        onClose={() => setPendingCashAction(null)}
        onConfirm={releaseCash}
        title={
          pendingCashAction?.action === 'release'
            ? `Release ${pendingCashAction.order.order_number}?`
            : `Cancel ${pendingCashAction?.order.order_number ?? 'order'}?`
        }
        message={
          pendingCashAction?.action === 'release'
            ? 'This closes the unpaid cash order and tells the customer it was released. No stock was consumed, so another student can order the same items.'
            : 'This closes the unpaid cash order as a no-show and notifies the customer. No stock was consumed.'
        }
        confirmLabel={pendingCashAction?.action === 'release' ? 'Release order' : 'Cancel no-show'}
        cancelLabel="Keep order"
        busy={Boolean(pendingCashAction) && busy === pendingCashAction.order.id}
      />

      <Modal
        open={Boolean(detailsOrder)}
        onClose={() => setDetailsId(null)}
        title={detailsOrder?.order_number ?? 'Order details'}
        eyebrow="Order details"
        wide
        footer={
          <div className="row">
            {canUndoDecline(detailsOrder) && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === detailsOrder.id}
                onClick={() => undo(detailsOrder)}
              >
                <RotateCcw size={15} aria-hidden="true" />
                {busy === detailsOrder.id ? 'Restoring…' : 'Undo decline'}
              </button>
            )}
            {canUndoStatus(detailsOrder) && (
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy === detailsOrder.id}
                onClick={() => undo(detailsOrder)}
              >
                <RotateCcw size={15} aria-hidden="true" />
                {busy === detailsOrder.id ? 'Undoing…' : 'Undo'}
              </button>
            )}
            {detailsOrder?.payment_status === 'unpaid' && (
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy === detailsOrder.id}
                onClick={() => {
                  setDetailsId(null)
                  setPendingDelete(detailsOrder)
                }}
              >
                <Trash2 size={15} aria-hidden="true" /> Delete
              </button>
            )}
            {canReleaseCashOrder(detailsOrder, now) && (
              <>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy === detailsOrder.id}
                  onClick={() => {
                    setDetailsId(null)
                    setPendingCashAction({ order: detailsOrder, action: 'cancel' })
                  }}
                >
                  Cancel no-show
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy === detailsOrder.id}
                  onClick={() => {
                    setDetailsId(null)
                    setPendingCashAction({ order: detailsOrder, action: 'release' })
                  }}
                >
                  Release order
                </button>
              </>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => setDetailsId(null)}>
              Close
            </button>
          </div>
        }
      >
        {detailsOrder && <OrderDetails order={detailsOrder} student={profiles[detailsOrder.user_id]} />}
      </Modal>
    </>
  )
}
