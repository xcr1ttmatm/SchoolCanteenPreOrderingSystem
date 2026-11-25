import { supabase } from './supabase'

// Local calendar date (YYYY-MM-DD), not UTC — the board follows the canteen day.
export function todayKey() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/**
 * Master menu + today's staff overrides in one list.
 * If staff haven't posted a board yet, the master menu values are used.
 */
export async function fetchTodayMenu() {
  const date = todayKey()
  const [master, board] = await Promise.all([
    supabase.from('menu_items').select('*').order('category').order('name'),
    supabase.from('daily_menu').select('menu_item_id, available, stock').eq('menu_date', date),
  ])

  if (master.error) throw master.error
  if (board.error) throw board.error

  const overrides = new Map((board.data ?? []).map((row) => [row.menu_item_id, row]))
  const items = (master.data ?? []).map((item) => {
    const override = overrides.get(item.id)
    return {
      ...item,
      available: override ? override.available : item.available,
      stock: override ? override.stock : item.stock,
      onTodayBoard: Boolean(override),
    }
  })

  return { date, items, hasBoard: overrides.size > 0 }
}

export async function saveDailyEntry({ menuItemId, patch, userId }) {
  const { error } = await supabase.from('daily_menu').upsert(
    {
      menu_date: todayKey(),
      menu_item_id: menuItemId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: 'menu_date, menu_item_id' },
  )
  if (error) throw error
}

// Clears today's board so the master menu values show again.
export async function resetTodayMenu() {
  const { error } = await supabase.from('daily_menu').delete().eq('menu_date', todayKey())
  if (error) throw error
}

// Live portions: payments and staff edits both change what students can order.
export function watchMenu(onChange) {
  const channel = supabase
    .channel('menu-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_menu' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
