import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCart = create(
  persist(
    (set, get) => ({
      items: [],

      add: (item) =>
        set((state) => {
          const existing = state.items.find((entry) => entry.id === item.id)
          const limit = item.stock ?? 99
          if (existing) {
            return {
              items: state.items.map((entry) =>
                entry.id === item.id
                  ? { ...entry, quantity: Math.min(entry.quantity + 1, limit) }
                  : entry,
              ),
            }
          }
          return { items: [...state.items, { ...item, quantity: 1 }] }
        }),

      setQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((entry) => {
            if (entry.id !== id) return entry
            const limit = entry.stock ?? 99
            return { ...entry, quantity: Math.max(1, Math.min(Number(quantity) || 1, limit)) }
          }),
        })),

      remove: (id) =>
        set((state) => ({ items: state.items.filter((entry) => entry.id !== id) })),

      clear: () => set({ items: [] }),

      total: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),

      count: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: 'spc-canteen-cart' },
  ),
)
