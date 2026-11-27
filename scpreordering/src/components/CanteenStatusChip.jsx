import { Store } from 'lucide-react'
import { useCanteenStatus } from '../context/useCanteenStatus'

export default function CanteenStatusChip() {
  const { isOpen, loading } = useCanteenStatus()

  if (loading) return null

  return (
    <span
      className={`tag canteen-chip ${isOpen ? 'sage' : 'tomato'}`}
      title={isOpen ? 'Taking new orders' : 'New orders are paused'}
    >
      <Store size={13} aria-hidden="true" />
      {isOpen ? 'Open' : 'Closed'}
    </span>
  )
}
