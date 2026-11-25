export const money = (value) => `₱${Number(value || 0).toFixed(2)}`

export const statusMeta = {
  pending: { label: 'Waiting', tone: 'mustard' },
  accepted: { label: 'Accepted', tone: 'sage' },
  payment: { label: 'Awaiting payment', tone: 'tomato' },
  preparing: { label: 'Preparing', tone: 'mustard' },
  ready: { label: 'Ready for pickup', tone: 'sage-solid' },
  completed: { label: 'Collected', tone: 'grey' },
  rejected: { label: 'Declined', tone: 'tomato' },
}

export const statusLabel = (status) => statusMeta[status]?.label ?? status ?? '—'

export const greetingForHour = (hour = new Date().getHours()) => {
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

export const pickupLabel = (value) => {
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

export const firstName = (name) => (name || 'there').trim().split(/\s+/)[0]

export const activeStatuses = ['pending', 'accepted', 'payment', 'preparing', 'ready']
