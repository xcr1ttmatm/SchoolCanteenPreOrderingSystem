import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBasket } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCanteenStatus } from '../../context/useCanteenStatus'
import { fetchTodayMenu, watchMenu } from '../../lib/menu'
import { money } from '../../lib/format'
import { useCart } from '../../store/cartStore'

export default function StudentMenu() {
  const [items, setItems] = useState([])
  const [hasBoard, setHasBoard] = useState(false)
  const [category, setCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const count = useCart((state) => state.count())
  const add = useCart((state) => state.add)
  const { isOpen } = useCanteenStatus()

  useEffect(() => {
    let mounted = true
    const refresh = () => {
      fetchTodayMenu()
        .then((result) => {
          if (!mounted) return
          setItems(result.items)
          setHasBoard(result.hasBoard)
        })
        .catch((error) => toast.error(error.message))
        .finally(() => {
          if (mounted) setLoading(false)
        })
    }

    refresh()
    const stopWatching = watchMenu(refresh)
    return () => {
      mounted = false
      stopWatching()
    }
  }, [])

  const categories = ['All', ...new Set(items.map((item) => item.category))]
  const visible = category === 'All' ? items : items.filter((item) => item.category === category)

  const handleAdd = (item) => {
    if (!isOpen) {
      toast.error('The counter is closed. New baskets are paused until staff reopen it.')
      return
    }
    if (!item.available || item.stock <= 0) return
    add(item)
    toast.success(`${item.name} added to your basket`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">Menu · made this morning</span>
          <h1 className="greeting">What sounds good?</h1>
          <p className="status-line">Pick your food now, pick it up later. The counter will have it ready.</p>
        </div>
        <Link to="/cart" className="btn btn-primary">
          <ShoppingBasket size={17} aria-hidden="true" /> View basket ({count})
        </Link>
      </div>

      {!loading && !hasBoard && (
        <div className="notice mb-24">
          Today's board isn't up yet — showing the usual menu. The canteen may still change what's for sale.
        </div>
      )}

      <div className="chip-row" role="group" aria-label="Menu categories">
        {categories.map((name) => (
          <button
            type="button"
            key={name}
            className={`chip${category === name ? ' active' : ''}`}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Laying out the menu…</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p className="section-title">Nothing on the board yet.</p>
          <p className="muted">The canteen will put today's food up soon.</p>
        </div>
      ) : (
        <div className="grid-cards">
          {visible.map((item) => {
            const soldOut = !item.available || item.stock <= 0
            return (
              <article className="hard-card" key={item.id}>
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{ display: 'block', width: 54, height: 54, marginLeft: 'auto', borderRadius: 10, objectFit: 'cover', border: '2px solid #1F2A24' }}
                  />
                ) : null}
                <span className="tiny-label mt-8">{item.category}</span>
                <h2 className="section-title mt-8">{item.name}</h2>
                <p className="muted" style={{ fontSize: 14, minHeight: 40 }}>{item.description || 'Fresh from the canteen.'}</p>
                <div className="row between mt-16">
                  <span className="price">{money(item.price)}</span>
                  <span className={`tag ${soldOut ? 'tomato' : 'sage'}`}>
                    {soldOut ? 'Sold out' : `${item.stock} left`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm mt-16"
                  style={{ width: '100%', boxShadow: '3px 3px 0 #1F2A24' }}
                  disabled={soldOut || !isOpen}
                  onClick={() => handleAdd(item)}
                >
                  {!isOpen ? 'Counter closed' : soldOut ? 'Not today' : 'Add to basket'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
