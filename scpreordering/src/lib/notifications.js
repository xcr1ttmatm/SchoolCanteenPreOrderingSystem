import { supabase } from './supabase'

const NOTIFICATION_COLUMNS = 'id, order_id, title, body, read_at, created_at'

export async function fetchNotifications(userId, limit = 40) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) throw error
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) throw error
}

export function watchNotifications(userId, { onInsert, onUpdate } = {}) {
  if (!userId) return () => {}

  const filter = `user_id=eq.${userId}`
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter },
      (payload) => onInsert?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter },
      (payload) => onUpdate?.(payload.new),
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
