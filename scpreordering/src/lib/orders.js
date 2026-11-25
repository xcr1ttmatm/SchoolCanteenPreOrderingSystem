import { supabase } from './supabase'

export async function fetchMyOrders(userId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .eq('user_id', userId)
    .is('student_deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchAllOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, student_id, role, department_id, is_active, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export function watchOrders(onChange, filter) {
  const channel = supabase
    .channel(`orders-${filter ?? 'all'}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', ...(filter ? { filter } : {}) },
      onChange,
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekCounts(orders) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (6 - index))
    const count = orders.filter((order) => {
      const created = new Date(order.created_at)
      return (
        created.getFullYear() === day.getFullYear() &&
        created.getMonth() === day.getMonth() &&
        created.getDate() === day.getDate()
      )
    }).length
    return { label: dayNames[day.getDay()], count }
  })
}

export function isToday(value) {
  if (!value) return false
  const date = new Date(value)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function itemSummary(order) {
  const items = order.order_items ?? []
  if (!items.length) return '—'
  const first = items[0].name_snapshot
  return items.length > 1 ? `${first} +${items.length - 1} more` : first
}
