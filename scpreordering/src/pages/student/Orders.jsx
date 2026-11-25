import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '../../components/Modal'
import { Receipt } from '../../components/Receipt'
import { EmptyState, Squiggle, StatusTag } from '../../components/ui'
import { useAuth } from '../../context/useAuth'
import { cancelOrder, deleteOwnOrder, startOnlinePayment } from '../../lib/checkout'
import { cashWindow, deadlineLabel } from '../../lib/cashWait'
import { money, pickupLabel } from '../../lib/format'
import { fetchMyOrders, watchOrders } from '../../lib/orders'
import { useCart } from '../../store/cartStore'

function cashNotice(order, now) {
  if (order.payment_method !== 'cash' || order.payment_status === 'paid') return null

  if (order.cash_close_reason === 'released_no_show') {
    return { tone: 'closed', text: 'Released by the canteen. The portions are available again.' }
  }
  if (order.cash_close_reason === 'cancelled_no_show') {
    return { tone: 'closed', text: 'Cancelled by the canteen after the pickup wait.' }
  }
  if (order.cash_close_reason === 'expired') {
    return { tone: 'closed', text: 'Closed automatically after the 1-hour pickup window.' }
  }

  const wait = cashWindow(order, now)
  if (!wait.deadline) return null
  if (wait.expired) {
    return { tone: 'closed', text: 'The 1-hour pickup window has closed.' }
  }
  if (wait.manual) {
    return {
      tone: 'warning',
      text: `Over 15 minutes old. The canteen may cancel or release this order; ${wait.remainingMinutes} min left.`,
    }
  }
  return { tone: '', text: `Pay at the counter by ${deadlineLabel(wait.deadline)}.` }
}

export default function StudentOrders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [receiptId, setReceiptId] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [now, setNow] = useState(() => Date.now())
  const clearCart = useCart((state) => state.clear)

  const load = useCallback(async () => {
    if (!profile?.id) return
    try {
      setOrders(await fetchMyOrders(profile.id))
    } finally {
      setLoading(false)
    }
  }, [profile?.id])

  useEffect(() => {
    load()
    if (!profile?.id) return undefined
    return watchOrders(() => load(), `user_id=eq.${profile.id}`)
  }, [load, profile?.id])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const result = searchParams.get('stripe')
    if (!result) return

    if (result === 'success') {
      clearCart()
      toast.success('Payment submitted. Waiting for confirmation — this order will update on its own.')
    } else if (result === 'cancelled') {
      toast('Payment cancelled. Your basket is still here — you can pay from this list.', {
        icon: '↩',
      })
    }

    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, clearCart])

  const pay = async (order) => {
    setBusy(order.id)
    try {
      const checkoutUrl = await startOnlinePayment(order.id)
      toast.success('Opening the checkout…')
      window.location.assign(checkoutUrl)
    } catch (error) {
      toast.error(error.message || 'Could not open checkout.')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (order) => {
    setBusy(order.id)
    try {
      await cancelOrder(order.id)
      toast.success('Order cancelled.')
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not cancel the order.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    const order = pendingDelete
    if (!order) return

    setBusy(order.id)
    try {
      await deleteOwnOrder(order.id)
      toast.success(
        order.payment_status === 'paid'
          ? 'Order hidden from your list.'
          : 'Order deleted.',
      )
      setPendingDelete(null)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not delete the order.')
    } finally {
      setBusy(null)
    }
  }

  const canPay = (order) =>
    order.payment_status === 'unpaid'
      && order.payment_method === 'online'
      && ['pending', 'accepted', 'payment'].includes(order.status)

  const canCancel = (order) =>
    order.payment_status === 'unpaid'
      && ['pending', 'accepted', 'payment'].includes(order.status)

  const receiptOrder = orders.find((order) => order.id === receiptId) ?? null

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">Your orders</span>
          <h1 className="greeting">The running list.</h1>
          <Squiggle />
          <p className="status-line">
            Every order you have placed, newest first. It updates on its own. Online payments use test mode — no real money moves.
          </p>
        </div>
        <Link to="/menu" className="btn btn-primary">New order</Link>
      </div>

      {loading ? (
        <p className="muted">Checking the ledger…</p>
      ) : orders.length === 0 ? (
        <EmptyState title="No orders yet" hint="Once you order, you can follow it here all the way to the counter." />
      ) : (
        orders.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="row between">
              <div>
                <span className="tiny-label">{order.order_number}</span>
                <p className="section-title mt-8">{pickupLabel(order.pickup_time)}</p>
              </div>
              <StatusTag status={order.status} />
            </div>
            <hr className="divider-dashed" />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(order.order_items ?? []).map((item) => (
                <li key={item.id} style={{ margin: '6px 0' }}>
                  {item.name_snapshot} × {item.quantity}
                  <span className="muted"> — {money(item.unit_price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            {order.notes && <p className="muted mt-8">Note: {order.notes}</p>}
            <hr className="divider-dashed" />
            <div className="row between">
              <div>
                <strong className="price">Total {money(order.total)}</strong>
                <div className="stat-context">
                  {order.payment_method === 'cash' ? 'Cash at the canteen' : 'Online'}
                  {' · '}
                  {order.payment_status === 'paid' ? 'Paid' : 'Not paid yet'}
                </div>
                {order.payment_status === 'unpaid' && order.payment_session_id && (
                  <div className="stat-context">Checkout started — finish paying to continue</div>
                )}
                {cashNotice(order, now) && (
                  <div className={`notice cash-wait ${cashNotice(order, now).tone}`}>
                    {cashNotice(order, now).text}
                  </div>
                )}
              </div>
              <div className="row">
                {canPay(order) && (
                  <button className="btn btn-primary btn-sm" disabled={busy === order.id} onClick={() => pay(order)}>
                    {busy === order.id ? 'Opening checkout…' : 'Pay online'}
                  </button>
                )}
                {order.payment_status === 'unpaid' && order.payment_method === 'cash' && (
                  <span className="tag mustard">Pay at the counter</span>
                )}
                {canCancel(order) && (
                  <button className="btn btn-quiet btn-sm" disabled={busy === order.id} onClick={() => cancel(order)}>
                    Cancel
                  </button>
                )}
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => setReceiptId(order.id)}
                >
                  Receipt
                </button>
                <button
                  className="btn btn-quiet btn-sm"
                  disabled={busy === order.id}
                  onClick={() => setPendingDelete(order)}
                >
                  <Trash2 size={14} aria-hidden="true" /> Delete
                </button>
              </div>
            </div>
          </article>
        ))
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        title={`Delete ${pendingDelete?.order_number ?? 'order'}?`}
        message={
          pendingDelete?.payment_status === 'paid'
            ? 'This removes the order from your list only. The canteen keeps the record for sales and pickup.'
            : 'This permanently removes the order. Nothing has been paid, and no portions were reserved.'
        }
        confirmLabel="Delete order"
        cancelLabel="Keep order"
        busy={Boolean(pendingDelete) && busy === pendingDelete.id}
      />

      <Receipt order={receiptOrder} onClose={() => setReceiptId(null)} />
    </>
  )
}
