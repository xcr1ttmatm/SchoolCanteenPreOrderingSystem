export const CASH_MANUAL_MINUTES = 15
export const CASH_AUTO_MINUTES = 60

const toTime = (value) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

export function cashWindow(order, now = Date.now()) {
  const start = toTime(order?.created_at)
  const storedDeadline = toTime(order?.cash_hold_until)
  const deadline = storedDeadline ?? (start === null ? null : start + CASH_AUTO_MINUTES * 60_000)

  if (start === null || deadline === null) {
    return {
      start: null,
      deadline: null,
      elapsedMinutes: 0,
      remainingMinutes: 0,
      manual: false,
      expired: false,
    }
  }

  return {
    start,
    deadline,
    elapsedMinutes: Math.max(0, Math.floor((now - start) / 60_000)),
    remainingMinutes: Math.max(0, Math.ceil((deadline - now) / 60_000)),
    manual: now - start >= CASH_MANUAL_MINUTES * 60_000 && now < deadline,
    expired: now >= deadline,
  }
}

export const isOpenCashOrder = (order) =>
  order?.payment_method === 'cash'
  && order?.payment_status === 'unpaid'
  && ['pending', 'accepted', 'payment'].includes(order?.status)

export const canReleaseCashOrder = (order, now) => {
  const window = cashWindow(order, now)
  return isOpenCashOrder(order) && window.manual
}

export const deadlineLabel = (value) => {
  const time = toTime(value)
  if (time === null) return '—'
  return new Date(time).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
