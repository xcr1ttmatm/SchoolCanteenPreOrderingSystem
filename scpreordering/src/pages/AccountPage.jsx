import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Squiggle } from '../components/ui'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { homeFor } from '../lib/routes'

export default function AccountPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setDepartmentId(profile?.department_id ?? '')
  }, [profile])

  useEffect(() => {
    let mounted = true
    supabase
      .from('departments')
      .select('id, code, name')
      .order('name')
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) toast.error(error.message)
        else setDepartments(data ?? [])
      })
    return () => { mounted = false }
  }, [])

  const departmentName = departments.find((item) => item.id === profile?.department_id)?.name
    ?? (profile?.role === 'student' ? 'Not set yet' : '—')

  const save = async (event) => {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    const patch = { full_name: fullName.trim() }
    if (profile.role === 'student') patch.department_id = departmentId || null

    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    setSaving(false)
    if (error) toast.error(error.message)
    else {
      await refreshProfile()
      toast.success('Details saved.')
    }
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile?.student_id ?? '')
      toast.success('School ID copied.')
    } catch {
      toast.error('Could not copy — write it down instead.')
    }
  }

  const leave = async () => {
    const { error } = await signOut()
    if (error) toast.error(error.message)
    else navigate('/login')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="tiny-label">Your corner of the canteen</span>
          <h1 className="greeting">Account.</h1>
          <Squiggle />
          <p className="status-line">Your School ID gets you through the door — and your order to the counter.</p>
        </div>
      </div>

      <div className="hard-card mb-24" style={{ maxWidth: 520 }}>
        <span className="tiny-label">School ID</span>
        <div className="row between mt-8">
          <div className="id-number" style={{ margin: 0 }}>{profile?.student_id || '—'}</div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={copyId}>
            <Copy size={15} aria-hidden="true" /> Copy
          </button>
        </div>
        <p className="stat-context">Use this with your password to sign in.</p>
      </div>

      <div className="hard-card" style={{ maxWidth: 520 }}>
        <div className="row between">
          <div>
            <span className="tiny-label">Signed in as</span>
            <p className="section-title mt-8">{profile?.full_name}</p>
          </div>
          <span className="tag sage">{profile?.role}</span>
        </div>
        <p className="stat-context">{departmentName}</p>
        <hr className="divider-dashed" />

        <form onSubmit={save}>
          <div className="field">
            <label className="tiny-label" htmlFor="accountName">Full name</label>
            <input id="accountName" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          {profile?.role === 'student' && (
            <div className="field">
              <label className="tiny-label" htmlFor="accountDepartment">Department</label>
              <select
                id="accountDepartment"
                className="input"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Choose your college…</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </form>

        <hr className="divider-dashed" />
        <button type="button" className="btn btn-quiet" onClick={leave}>Sign out</button>
        <button type="button" className="btn btn-quiet ml-8" onClick={() => navigate(homeFor(profile?.role))}>
          Back to dashboard
        </button>
      </div>
    </>
  )
}
