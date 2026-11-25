import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Copy, UserPlus } from 'lucide-react'
import { z } from 'zod'
import AccessToggle from '../../components/AccessToggle'
import PasswordField from '../../components/PasswordField'
import { Squiggle } from '../../components/ui'
import { useAuth } from '../../context/useAuth'
import { fetchProfiles } from '../../lib/orders'
import { supabase } from '../../lib/supabase'

const schema = z
  .object({
    fullName: z.string().min(2, 'Enter the staff member name'),
    password: z.string().min(6, 'At least 6 characters'),
    confirmPassword: z.string().min(1, 'Confirm the password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

export default function StaffAdmin() {
  const { profile } = useAuth()
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [createdId, setCreatedId] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const load = async () => {
    try {
      setPeople(await fetchProfiles())
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const createStaff = async (values) => {
    try {
      const { data, error } = await supabase.rpc('create_staff_account', {
        p_full_name: values.fullName.trim(),
        p_password: values.password,
      })
      if (error) throw error
      setCreatedId(data)
      reset()
      load()
      toast.success('Staff account created.')
    } catch (error) {
      toast.error(error.message || 'Could not create the account.')
    }
  }

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

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(createdId)
      toast.success('ID copied.')
    } catch {
      toast.error('Could not copy — write it down instead.')
    }
  }

  const visible = people.filter((person) =>
    `${person.full_name} ${person.student_id ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  )
  const staff = people.filter((person) => person.role === 'staff').length
  const admins = people.filter((person) => person.role === 'admin').length

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">Who's who</span>
          <h1 className="greeting">Staff access.</h1>
          <Squiggle />
          <p className="status-line">
            {staff} staff, {admins} admin{admins === 1 ? '' : 's'}, {people.length - staff - admins} students.
          </p>
        </div>
        <span className="tag sage"><UserPlus size={15} aria-hidden="true" /> Created here</span>
      </div>

      <div className="split">
        <form className="hard-card" onSubmit={handleSubmit(createStaff)}>
          <span className="tiny-label">New account</span>
          <h2 className="section-title mt-8">Add canteen staff</h2>
          <div className="field">
            <label className="tiny-label" htmlFor="staffName">Full name</label>
            <input id="staffName" className="input" placeholder="Mara Santos" {...register('fullName')} />
            {errors.fullName && <span className="error-text">{errors.fullName.message}</span>}
          </div>
          <PasswordField
            id="staffPassword"
            label="Password"
            error={errors.password}
            registration={register('password')}
            autoComplete="new-password"
          />
          <PasswordField
            id="staffConfirm"
            label="Confirm password"
            error={errors.confirmPassword}
            registration={register('confirmPassword')}
            autoComplete="new-password"
          />
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create staff account'}
          </button>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            New admins are created with the SQL setup script, not here.
          </p>
        </form>

        <div className="sticky" aria-label="New staff ID">
          <h2 className="sticky-title">{createdId ? 'Write this down' : 'Don\'t forget'}</h2>
          {createdId ? (
            <>
              <p style={{ margin: '0 0 12px' }}>Give this ID to the new staff member.</p>
              <div className="row between">
                <strong style={{ fontFamily: 'var(--serif)', fontSize: 26 }}>{createdId}</strong>
                <button type="button" className="btn btn-quiet btn-sm" onClick={copyId}>
                  <Copy size={14} aria-hidden="true" /> Copy
                </button>
              </div>
            </>
          ) : (
            <ul>
              <li>Staff sign in with the ID you give them here.</li>
              <li>They run the menu, today's board, sales and the queue.</li>
              <li>Revoke access here to sign someone out immediately.</li>
              <li>Activate again later — their ID and password stay the same.</li>
            </ul>
          )}
        </div>
      </div>

      <section className="hard-card">
        <span className="tiny-label">People</span>
        <h2 className="section-title mt-8">Roles &amp; access</h2>
        <div className="field" style={{ maxWidth: 360 }}>
          <label className="tiny-label" htmlFor="staffSearch">Find someone</label>
          <input
            id="staffSearch"
            className="input"
            placeholder="Name or ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {loading ? (
          <p className="muted">Reading the staff book…</p>
        ) : (
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">ID</th>
                  <th scope="col">Role</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((person) => (
                  <tr key={person.id}>
                    <td><strong>{person.full_name}</strong></td>
                    <td>{person.student_id || '—'}</td>
                    <td>
                      <select
                        className="input"
                        style={{ width: 150, minHeight: 40 }}
                        value={person.role}
                        onChange={(event) => setRole(person, event.target.value)}
                        aria-label={`Role for ${person.full_name}`}
                      >
                        {person.role === 'admin' && <option value="admin" disabled>admin</option>}
                        <option value="student">student</option>
                        <option value="staff">staff</option>
                      </select>
                    </td>
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
        )}
      </section>
    </>
  )
}
