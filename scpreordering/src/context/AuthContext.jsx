import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const applyProfile = useCallback((data) => {
    if (data?.is_active === false) {
      setProfile(data)
      setLoading(false)
      void supabase.auth.signOut()
      return data
    }

    setProfile(data ?? null)
    setLoading(false)
    return data
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return undefined
    }

    let mounted = true
    setLoading(true)

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      if (mounted) applyProfile(data)
      return data
    }

    loadProfile().catch(() => {
      if (!mounted) return
      setProfile(null)
      setLoading(false)
    })

    // If an admin revokes access while someone is working, close their session.
    const channel = supabase
      .channel(`own-profile-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => {
          loadProfile().catch(() => {})
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, applyProfile])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
    if (error) throw error
    return applyProfile(data)
  }, [session, applyProfile])

  const signUp = useCallback(async ({ schoolId, departmentCode, fullName, password }) => {
    const cleanId = schoolId.trim()
    const { data, error } = await supabase.auth.signUp({
      email: `${cleanId}@spc.test`,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          school_id: cleanId,
          department_code: departmentCode,
        },
      },
    })
    if (error) throw error

    // GoTrue returns a user with no identities when the email already exists.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('That School ID is already registered. Try signing in.')
    }
    return data
  }, [])

  const signIn = useCallback(async ({ schoolId, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${schoolId.trim()}@spc.test`,
      password,
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = {
    session,
    profile,
    loading,
    role: profile?.role ?? null,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
