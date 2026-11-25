import { supabase } from './supabase'

export async function setAccountActive(userId, active) {
  const { error } = await supabase.rpc('set_account_active', {
    p_user_id: userId,
    p_active: active,
  })
  if (error) throw error
}
