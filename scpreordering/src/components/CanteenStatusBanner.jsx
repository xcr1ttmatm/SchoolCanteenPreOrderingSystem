import { Store } from 'lucide-react'
import { useCanteenStatus } from '../context/useCanteenStatus'

export default function CanteenStatusBanner() {
  const { isOpen, reason, loading } = useCanteenStatus()

  if (loading || isOpen) return null

  return (
    <div className="canteen-banner mb-24" role="status">
      <Store size={20} aria-hidden="true" />
      <div>
        <strong>The canteen counter is closed right now.</strong>
        <p className="muted mt-8">
          {reason ? `Note from the counter: ${reason} ` : ''}
          You can still browse the menu and check your orders. New orders open again
          when staff reopen the counter.
        </p>
      </div>
    </div>
  )
}
