import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import PasswordField from '../components/PasswordField'
import { Squiggle } from '../components/ui'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { homeFor } from '../lib/routes'

const passwordRule = z.string().min(6, 'At least 6 characters')
const schoolIdRule = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{5}$/, 'Use YYYY-NNNNN, e.g. 2023-00000')

const schemaFor = (mode) =>
  mode === 'signup'
    ? z
        .object({
          fullName: z.string().trim().min(2, 'Enter your name'),
          schoolId: schoolIdRule,
          departmentCode: z.string().min(1, 'Select your department'),
          password: passwordRule,
          confirmPassword: z.string().min(1, 'Confirm your password'),
        })
        .refine((values) => values.password === values.confirmPassword, {
          path: ['confirmPassword'],
          message: 'Passwords do not match',
        })
    : z.object({
        schoolId: z
          .string()
          .trim()
          .regex(/^(?:\d{4}-\d{5}|ST-\d{4}|admin)$/i, 'Use YYYY-NNNNN, ST-0001, or admin'),
        password: passwordRule,
      })

function AuthForm({ mode, departments, onSwitch }) {
  const { signIn, signUp } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schemaFor(mode)) })

  const onSubmit = async (values) => {
    try {
      if (mode === 'signup') {
        await signUp({
          schoolId: values.schoolId,
          departmentCode: values.departmentCode,
          fullName: values.fullName,
          password: values.password,
        })
        toast.success('Account created. Welcome to the canteen.')
      } else {
        await signIn({ schoolId: values.schoolId, password: values.password })
        toast.success('Welcome back to the canteen.')
      }
    } catch (error) {
      const message = error?.message || 'Something went wrong. Try again.'
      const lower = message.toLowerCase()
      const friendly = lower.includes('banned') || lower.includes('revoked')
        ? 'This account has been revoked. Contact the administrator.'
        : message.includes('Invalid login credentials')
          ? 'That School ID and password do not match.'
          : message.includes('already registered')
            ? 'That School ID is already registered. Try signing in.'
            : message.includes('Invalid ID format')
              ? 'Use YYYY-NNNNN, e.g. 2023-00000.'
              : message
      toast.error(friendly)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-24">
        {mode === 'signup' ? (
          <div className="field">
            <label className="tiny-label" htmlFor="fullName">Your name</label>
            <input
              id="fullName"
              className="input"
              placeholder="Juan Dela Cruz"
              autoComplete="name"
              {...register('fullName')}
            />
            {errors.fullName && <span className="error-text">{errors.fullName.message}</span>}
          </div>
        ) : (
          <div className="field">
            <label className="tiny-label" htmlFor="schoolId">School ID</label>
            <input
              id="schoolId"
              className="input"
              placeholder="2023-00000"
              autoComplete="username"
              {...register('schoolId')}
            />
            {errors.schoolId && <span className="error-text">{errors.schoolId.message}</span>}
          </div>
        )}

        {mode === 'signup' && (
          <>
            <div className="field">
              <label className="tiny-label" htmlFor="schoolId">School ID</label>
              <input
                id="schoolId"
                className="input"
                placeholder="2023-00000"
                inputMode="numeric"
                autoComplete="off"
                {...register('schoolId')}
              />
              <span className="stat-context">Format YYYY-NNNNN. You will use this to sign in.</span>
              {errors.schoolId && <span className="error-text">{errors.schoolId.message}</span>}
            </div>

            <div className="field">
              <label className="tiny-label" htmlFor="departmentCode">Department</label>
              <select
                id="departmentCode"
                className="input"
                defaultValue=""
                {...register('departmentCode')}
              >
                <option value="" disabled>Choose your college…</option>
                {departments.map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.name}
                  </option>
                ))}
              </select>
              {errors.departmentCode && <span className="error-text">{errors.departmentCode.message}</span>}
            </div>
          </>
        )}

        <PasswordField
          id="password"
          label="Password"
          error={errors.password}
          registration={register('password')}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />

        {mode === 'signup' && (
          <PasswordField
            id="confirmPassword"
            label="Confirm password"
            error={errors.confirmPassword}
            registration={register('confirmPassword')}
            autoComplete="new-password"
          />
        )}

        <button type="submit" className="btn btn-primary mt-8" disabled={isSubmitting} style={{ width: '100%' }}>
          {isSubmitting ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="auth-foot">
        <span className="muted">{mode === 'signin' ? 'No account yet?' : 'Already have one?'}</span>
        <button type="button" className="link-button" onClick={() => onSwitch(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Make an account' : 'Sign in instead'}
        </button>
      </div>
    </>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState('signin')
  const [departments, setDepartments] = useState([])
  const { session, profile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (session && profile && profile.is_active !== false) {
      navigate(homeFor(profile.role), { replace: true })
    }
  }, [session, profile, navigate])

  useEffect(() => {
    let mounted = true
    supabase
      .from('departments')
      .select('code, name')
      .order('name')
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) toast.error(error.message)
        else setDepartments(data ?? [])
      })
    return () => { mounted = false }
  }, [])

  return (
    <div className="auth-wrap">
      <div className="hard-card auth-card">
        <span className="tiny-label">SPC Canteen · Pre-order</span>
        <h1 className="greeting">Hello there.</h1>
        <Squiggle />
        <p className="status-line">
          {mode === 'signin'
            ? 'Sign in with your School ID to skip the line.'
            : 'Use your School ID and pick your department. No email needed.'}
        </p>
        <AuthForm key={mode} mode={mode} departments={departments} onSwitch={setMode} />
      </div>
    </div>
  )
}
