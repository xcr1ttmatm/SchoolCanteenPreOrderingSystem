import { useContext } from 'react'
import { CanteenContext } from './canteenContext'

export function useCanteenStatus() {
  const context = useContext(CanteenContext)
  if (!context) throw new Error('useCanteenStatus must be used inside CanteenStatusProvider')
  return context
}
