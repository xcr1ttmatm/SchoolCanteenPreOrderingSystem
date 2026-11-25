import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { EmptyState } from '../../components/ui'
import { fetchOrderNumber, placeOrder, startOnlinePayment } from '../../lib/checkout'
import { money } from '../../lib/format'
import { fetchTodayMenu } from '../../lib/menu'
import { useCart } from '../../store/cartStore'

const pad = (value) => String(value).padStart(2, '0')

export default function StudentCart() {
  const navigate = useNavigate()
  const items = useCart((state) => state.items)
  const total = useCart((state) => state.total())
  const setQuantity = useCart((state) => state.setQuantity)
  const remove = useCart((state) => state.remove)
  const clear = useCart((state) => state.clear)
  const [pickupTime, setPickupTime] = useState('12:00')
  const [notes, setNotes] = useState('')
  const [method, setMethod] = useState('online')
  const [placing, setPlacing] = useState(false)

  const checkFreshStock = async () => {
    const { items: live } = await fetchTodayMenu()
    const byId = new Map(live.map((item) => [item.id, item]))
    for (const item of items) {
      const fresh = byId.get(item.id)
      if (!fresh) throw new Error(`${item.name} is no longer on the menu.`)
      if (!fresh.available) throw new Error(`${item.name} is not available today.`)
      if (fresh.stock < item.quantity) {
        throw new Error(`Only ${Math.max(0, fresh.stock)} portion${fresh.stock === 1 ? '' : 's'} of ${item.name} left. Update your basket.`)
      }
    }
  }

  const place = async (event) => {
    event.preventDefault()
    if (!items.length) {
      toast.error('Your basket is empty.')
      return
    }

    const now = new Date()
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const pickup = new Date(`${datePart}T${pickupTime}:00`)
    if (Number.isNaN(pickup.getTime())) {
      toast.error('Pick a time before ordering.')
      return
    }

    setPlacing(true)
    try {
      await checkFreshStock()
      const orderId = await placeOrder({
        pickupTime: pickup.toISOString(),
        notes,
        method,
        items,
      })
      const number = await fetchOrderNumber(orderId)

      if (method === 'online') {
        try {
          const checkoutUrl = await startOnlinePayment(orderId)
          toast.success(`${number} placed. Opening the checkout…`)
          window.location.assign(checkoutUrl)
          return
        } catch (paymentError) {
          toast.error(
            `${number} was placed, but checkout could not open. Pay it from My Orders. ${paymentError.message}`,
          )
          navigate('/orders')
          return
        }
      }

      toast.success(`${number} placed. Pay at the counter to start preparation.`)
      clear()
      navigate('/orders')
    } catch (error) {
      toast.error(error.message || 'Could not place the order. Try again.')
    } finally {
      setPlacing(false)
    }
  }

  if (items.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <span className="tiny-label">Your basket</span>
            <h1 className="greeting">Nothing in here yet.</h1>
            <p className="status-line">Food you pick goes in this basket before it goes to the counter.</p>
          </div>
          <Link to="/menu" className="btn btn-primary">See the menu</Link>
        </div>
        <EmptyState title="An empty basket" hint="Add something from the menu and it will show up here." />
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">Your basket</span>
          <h1 className="greeting">Almost there.</h1>
          <p className="status-line">Check the items, pick a time, and choose how to pay.</p>
        </div>
        <Link to="/menu" className="btn btn-quiet">Keep browsing</Link>
      </div>

      <div className="split">
        <section className="hard-card">
          <span className="tiny-label">What you picked</span>
          <h2 className="section-title mt-8">{items.length} item{items.length === 1 ? '' : 's'}</h2>
          {items.map((item) => (
            <div className="line-item" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{money(item.price)} each</div>
              </div>
              <div className="row">
                <div className="qty">
                  <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => setQuantity(item.id, item.quantity - 1)}>−</button>
                  <span>{item.quantity}</span>
                  <button type="button" aria-label={`Add one ${item.name}`} onClick={() => setQuantity(item.id, item.quantity + 1)}>+</button>
                </div>
                <strong style={{ minWidth: 70, textAlign: 'right' }}>{money(item.price * item.quantity)}</strong>
                <button type="button" className="link-button" onClick={() => remove(item.id)}>Remove</button>
              </div>
            </div>
          ))}
          <p className="stat-context">
            Nothing is reserved until payment. If someone pays for the last portion first, you'll be asked to update your basket.
          </p>
        </section>

        <form className="hard-card" onSubmit={place}>
          <span className="tiny-label">The details</span>
          <h2 className="section-title mt-8">Pickup &amp; payment</h2>
          <div className="field">
            <label className="tiny-label" htmlFor="pickupTime">Pickup time today</label>
            <input
              id="pickupTime"
              type="time"
              className="input"
              value={pickupTime}
              min="10:00"
              max="14:00"
              step="900"
              onChange={(event) => setPickupTime(event.target.value)}
            />
          </div>

          <div className="field">
            <span className="tiny-label">How will you pay?</span>
            <div className="method-list" role="radiogroup" aria-label="Payment method">
              <button
                type="button"
                role="radio"
                aria-checked={method === 'online'}
                className={`method-card${method === 'online' ? ' active' : ''}`}
                onClick={() => setMethod('online')}
              >
                <strong>Pay online</strong>
                <span>Opens the hosted checkout. No real money moves. Your basket stays until payment is confirmed.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={method === 'cash'}
                className={`method-card${method === 'cash' ? ' active' : ''}`}
                onClick={() => setMethod('cash')}
              >
                <strong>Pay at the canteen</strong>
                <span>Pay in cash at the counter. Preparation starts only after staff confirm payment.</span>
              </button>
            </div>
          </div>

          <div className="field">
            <label className="tiny-label" htmlFor="notes">Note for the counter (optional)</label>
            <textarea
              id="notes"
              className="input"
              rows="3"
              placeholder="No onions, please."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <hr className="divider-dashed" />
          <div className="row between">
            <span className="tiny-label">Total</span>
            <span className="price">{money(total)}</span>
          </div>
          <button type="submit" className="btn btn-primary mt-16" style={{ width: '100%' }} disabled={placing}>
            {placing
              ? (method === 'online' ? 'Opening checkout…' : 'Sending to the canteen…')
              : (method === 'online' ? 'Place & pay online' : 'Place order')}
          </button>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            Test mode only — no real money moves. Stock is consumed only after payment is confirmed, first paid, first served.
          </p>
        </form>
      </div>
    </>
  )
}
