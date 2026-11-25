import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { UserPlus } from 'lucide-react'
import AccessToggle from '../../components/AccessToggle'
import { Squiggle, StatCard, StickyNote } from '../../components/ui'
import { useAuth } from '../../context/useAuth'
import { fetchProfiles } from '../../lib/orders'
import { supabase } from '../../lib/supabase'

export default function AdminAccounts() {
  const { profile } = useAuth()
  const [people, setPeople] = useState([])
  const [departments, setDepartments] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [rows, deptRows] = await Promise.all([
        fetchProfiles(),
        supabase.from('departments').select('id, name'),
      ])
      setPeople(rows)
      if (!deptRows.error) {
        setDepartments(Object.fromEntries((deptRows.data ?? []).map((row) => [row.id, row.name])))
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const setRole = async (person, role) => {
    if (person.id === profile?.id) {
      toast.error('You cannot change your own role here.')
      return
    }
    const { error } = await supabase.from('profiles').update({ role }).eq('id', person.id)
    if (error) toast.error(error.message)
    else {
      toast.success(`${person.full_name} is now ${role}.`)
      load()
    }
  }

  const visible = people.filter((person) => {
    const department = departments[person.department_id] ?? ''
    const status = person.is_active === false ? 'revoked' : 'active'
    return `${person.full_name} ${person.student_id ?? ''} ${department} ${person.role} ${status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  })

  const count = (role) => people.filter((person) => person.role === role).length
  const revokedCount = people.filter((person) => person.is_active === false).length

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">SPC Canteen · Accounts</span>
          <h1 className="greeting">Who's who.</h1>
          <Squiggle />
          <p className="status-line">Students and canteen staff. Create staff, check IDs, and control access here.</p>
        </div>
        <Link to="/admin/staff" className="btn btn-primary">
          <UserPlus size={17} aria-hidden="true" /> Add staff
        </Link>
      </div>

      <div className="stats">
        <StatCard label="Students" value={loading ? '…' : count('student')} context="Registered with School IDs" tone="sage" />
        <StatCard label="Staff" value={loading ? '…' : count('staff')} context="Run the canteen" tone="mustard" />
        <StatCard label="Admins" value={loading ? '…' : count('admin')} context="Monitor accounts" tone="paper" />
        <StatCard label="Revoked" value={loading ? '…' : revokedCount} context="Access turned off" tone="blush" />
      </div>

      <div className="split">
        <section className="hard-card">
          <span className="tiny-label">Account book</span>
          <h2 className="section-title mt-8">Everyone with access</h2>
          <div className="field" style={{ maxWidth: 360 }}>
            <label className="tiny-label" htmlFor="accountSearch">Find someone</label>
            <input
              id="accountSearch"
              className="input"
              placeholder="Name, ID, department, role, or status"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {loading ? (
            <p className="muted">Reading the account book…</p>
          ) : visible.length === 0 ? (
            <p className="muted">No accounts match that search.</p>
          ) : (
            <>
              <p className="swipe-hint">Swipe sideways to see every column →</p>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Account book table, scroll horizontally">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">School ID</th>
                      <th scope="col">Department</th>
                      <th scope="col">Role</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((person) => (
                      <tr key={person.id}>
                        <td><strong>{person.full_name}</strong></td>
                        <td>{person.student_id || '—'}</td>
                        <td>{departments[person.department_id] ?? '—'}</td>
                        <td>
                          <select
                            className="input"
                            style={{ width: 120, maxWidth: '100%', minHeight: 40 }}
                            value={person.role}
                            onChange={(event) => setRole(person, event.target.value)}
                            aria-label={`Role for ${person.full_name}`}
                          >
                            {person.role === 'admin' && <option value="admin" disabled>admin</option>}
                            <option value="student">student</option>
                            <option value="staff">staff</option>
                          </select>
                        </td>
                        <td>{person.created_at ? new Date(person.created_at).toLocaleDateString() : '—'}</td>
                        <td>
                          <AccessToggle
                            person={person}
                            currentUserId={profile?.id}
                            onChanged={load}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <StickyNote
          title="Keep an eye on"
          items={[
            'New staff accounts are created on the Add staff page.',
            'Staff run the menu, today\'s board, sales and the queue.',
            'Revoking an account signs them out and blocks sign-in.',
            'Activating restores the same ID and password.',
          ]}
        />
      </div>
    </>
  )
}
