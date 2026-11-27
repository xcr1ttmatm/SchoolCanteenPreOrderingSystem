import { supabase } from './supabase'

const fallback = { isOpen: true, reason: null, updatedAt: null }

export async function fetchCanteenStatus() {
  const { data, error } = await supabase
    .from('canteen_status')
    .select('is_open, reason, updated_at')
    .maybeSingle()
  if (error) throw error
  return {
    isOpen: data?.is_open ?? fallback.isOpen,
    reason: data?.reason ?? null,
    updatedAt: data?.updated_at ?? null,
  }
}

export function watchCanteenStatus(onChange) {
  const channel = supabase
    .channel('canteen-status-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'canteen_status' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export async function setCanteenStatus(open, reason = null) {
  const { error } = await supabase.rpc('set_canteen_status', {
    p_is_open: open,
    p_reason: reason || null,
  })
  if (error) throw error
}
