import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Squiggle } from '../../components/ui'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const blank = {
  name: '',
  description: '',
  category: 'Main',
  price: '',
  stock: '0',
  image_url: '',
}

export default function StaffMenuAdmin() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data, error } = await supabase.from('menu_items').select('*').order('category').order('name')
    if (error) toast.error(error.message)
    else setItems(data ?? [])
  }

  useEffect(() => { load() }, [])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const edit = (item) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      description: item.description ?? '',
      category: item.category,
      price: String(item.price),
      stock: String(item.stock ?? 0),
      image_url: item.image_url ?? '',
    })
    setFile(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const reset = () => {
    setEditingId(null)
    setForm(blank)
    setFile(null)
  }

  const save = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || !(Number(form.price) >= 0)) {
      toast.error('Give the item a name and a price.')
      return
    }
    setSaving(true)
    try {
      let imageUrl = form.image_url || null
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('menu-images')
          .upload(path, file, { upsert: true })
        if (uploadError) throw uploadError
        imageUrl = supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || 'Main',
        price: Number(form.price),
        stock: Math.max(0, Math.floor(Number(form.stock) || 0)),
        emoji: '',
        image_url: imageUrl,
      }

      const result = editingId
        ? await supabase.from('menu_items').update(payload).eq('id', editingId)
        : await supabase.from('menu_items').insert(payload)
      if (result.error) throw result.error

      toast.success(editingId ? 'Menu item updated.' : 'New item on the menu.')
      reset()
      load()
    } catch (error) {
      toast.error(error.message || 'Could not save the item.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item) => {
    if (!window.confirm(`Take ${item.name} off the menu?`)) return
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id)
    if (error) toast.error(error.message)
    else {
      toast.success(`${item.name} removed.`)
      load()
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">The menu</span>
          <h1 className="greeting">What the canteen sells.</h1>
          <Squiggle />
          <p className="status-line">Add dishes, prices, stock, and photos. Set what's actually for sale on today's board.</p>
        </div>
        <div className="row">
          <Link to="/staff/availability" className="btn btn-quiet">Today's board</Link>
          <button type="button" className="btn btn-primary" onClick={reset}>New item</button>
        </div>
      </div>

      <form className="hard-card mb-24" onSubmit={save}>
        <span className="tiny-label">{editingId ? 'Editing an item' : 'Something new'}</span>
        <h2 className="section-title mt-8">{editingId ? 'Change the details' : 'Add to the menu'}</h2>
        <div className="split" style={{ marginBottom: 0 }}>
          <div>
            <div className="field">
              <label className="tiny-label" htmlFor="itemName">Name</label>
              <input id="itemName" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Chicken Adobo" />
            </div>
            <div className="field">
              <label className="tiny-label" htmlFor="itemDescription">Description</label>
              <input id="itemDescription" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="With rice and extra sauce" />
            </div>
            <div className="field">
              <label className="tiny-label" htmlFor="itemCategory">Category</label>
              <input id="itemCategory" className="input" value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
          </div>
          <div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="tiny-label" htmlFor="itemPrice">Price</label>
                <input id="itemPrice" type="number" min="0" step="0.01" className="input" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="65.00" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="tiny-label" htmlFor="itemStock">Stock quantity</label>
                <input id="itemStock" type="number" min="0" step="1" className="input" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="tiny-label" htmlFor="itemImage">Food photo (optional)</label>
              <input id="itemImage" className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <p className="stat-context">
              Usual stock is used when no board is posted for today. Today's board overrides it.
            </p>
          </div>
        </div>
        <button type="submit" className="btn btn-primary mt-16" disabled={saving}>
          {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to menu'}
        </button>
      </form>

      <section className="hard-card">
        <span className="tiny-label">Everything the canteen makes</span>
        <h2 className="section-title mt-8">{items.length} items</h2>
        <p className="swipe-hint">Swipe sideways to see every column →</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Menu table, scroll horizontally">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Stock</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.category}</td>
                  <td>{money(item.price)}</td>
                  <td>{item.stock}</td>
                  <td>
                    <div className="row">
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => edit(item)}>Edit</button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => remove(item)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
