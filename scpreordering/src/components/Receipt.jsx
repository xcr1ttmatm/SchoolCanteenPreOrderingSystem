import { money, pickupLabel } from '../lib/format'
import { Modal } from './Modal'

const fullDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function Receipt({ order, onClose }) {
  if (!order) return null

  const payment = order.payments?.[0] ?? null
  const paid = order.payment_status === 'paid'
  const methodLabel = order.payment_method === 'cash' ? 'Cash at canteen' : 'Online (Stripe test)'

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Read-only receipt"
      title={`Receipt for ${order.order_number}`}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="receipt">
        <div className="receipt-brand">
          <span className="tiny-label">SPC Canteen</span>
          <p className="section-title mt-8">Pre-order receipt</p>
          <span className="muted receipt-reference">{order.order_number}</span>
        </div>

        <hr className="divider-dashed" />

        <div className="detail-grid">
          <div className="detail-row">
            <span className="muted">Order ID</span>
            <strong>{order.order_number}</strong>
            <span className="muted receipt-reference">{order.id}</span>
          </div>
          <div className="detail-row">
            <span className="muted">Order date and time</span>
            <strong>{fullDate(order.created_at)}</strong>
          </div>
          <div className="detail-row">
            <span className="muted">Payment method</span>
            <strong>{methodLabel}</strong>
          </div>
          <div className="detail-row">
            <span className="muted">Payment status</span>
            <span className={`tag ${paid ? 'sage-solid' : 'mustard'}`}>
              {paid ? 'Paid' : 'Not paid yet'}
            </span>
          </div>
          <div className="detail-row">
            <span className="muted">Pickup time</span>
            <strong>{pickupLabel(order.pickup_time)}</strong>
          </div>
          {paid && payment?.verified_at && (
            <div className="detail-row">
              <span className="muted">Paid at</span>
              <strong>{fullDate(payment.verified_at)}</strong>
            </div>
          )}
        </div>

        <hr className="divider-dashed" />

        <span className="tiny-label">Ordered items</span>
        <ul className="detail-items">
          {(order.order_items ?? []).map((item) => (
            <li className="detail-item" key={item.id}>
              <span>
                <strong>{item.name_snapshot}</strong> × {item.quantity}
                <span className="muted" style={{ fontSize: 11 }}> — {money(item.unit_price)} each</span>
              </span>
              <strong className="price">{money(item.unit_price * item.quantity)}</strong>
            </li>
          ))}
        </ul>

        <div className="detail-total">
          <strong>{paid ? 'Total amount paid' : 'Total due'}</strong>
          <strong className="price">{money(order.total)}</strong>
        </div>

        <p className="receipt-note">
          This receipt is read-only.{' '}
          {paid
            ? 'Keep it for your records, or show it at the counter when you pick up your order.'
            : 'Complete payment online or at the counter to mark this order as paid.'}
        </p>
      </div>
    </Modal>
  )
}
