import { supabase } from './supabase'

export async function placeOrder({ pickupTime, notes, method, items }) {
  const { data, error } = await supabase.rpc('place_order', {
    p_pickup_time: pickupTime,
    p_notes: notes,
    p_method: method,
    p_items: items.map(({ id, quantity }) => ({ id, quantity })),
  })
  if (error) throw error
  return data
}

export async function startOnlinePayment(orderId) {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { orderId },
  })
  if (error) {
    let detail = error.message
    if (error.context && typeof error.context.clone === 'function') {
      try {
        const body = await error.context.clone().json()
        detail = body.error ?? detail
      } catch {
        // Keep the default message when the function returned plain text.
      }
    }
    throw new Error(detail ?? 'Could not start online payment.')
  }
  const checkoutUrl = data?.checkoutUrl
  if (!checkoutUrl) throw new Error('Checkout did not return a link.')
  return checkoutUrl
}

export async function collectCash(orderId) {
  const { error } = await supabase.rpc('collect_cash', { p_order_id: orderId })
  if (error) throw error
}

export async function setOrderStatus(orderId, status) {
  const { error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: status,
  })
  if (error) throw error
}

export async function undoStatusChange(orderId) {
  const { error } = await supabase.rpc('undo_status_change', { p_order_id: orderId })
  if (error) throw error
}

export async function deleteOrderStaff(orderId) {
  const { error } = await supabase.rpc('delete_order_staff', { p_order_id: orderId })
  if (error) throw error
}

export async function cancelOrder(orderId) {
  const { error } = await supabase.rpc('cancel_own_order', { p_order_id: orderId })
  if (error) throw error
}

export async function declineOrder(orderId) {
  const { error } = await supabase.rpc('decline_order', { p_order_id: orderId })
  if (error) throw error
}

export async function undoDecline(orderId) {
  const { error } = await supabase.rpc('undo_decline', { p_order_id: orderId })
  if (error) throw error
}

export async function deleteOwnOrder(orderId) {
  const { error } = await supabase.rpc('delete_own_order', { p_order_id: orderId })
  if (error) throw error
}

export async function fetchOrderNumber(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw error
  return data?.order_number ?? 'Your order'
}
