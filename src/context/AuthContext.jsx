import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [activeRole, setActiveRole] = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Reset profile/role before loading new user's data
        setProfile(null)
        setActiveRole(null)
        setUser(firebaseUser)
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)
          const saved = localStorage.getItem(`refsync_role_${firebaseUser.uid}`)
          const role  = saved && data.roles?.includes(saved) ? saved : data.roles?.[0]
          setActiveRole(role)
        }
      } else {
        setUser(null)
        setProfile(null)
        setActiveRole(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const signUp = async ({ email, password, displayName, roles, subRoles = [] }) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })

    const profileData = {
      uid: cred.user.uid,
      displayName,
      email,
      roles,
      subRoles,
      createdAt: serverTimestamp(),
      officialProfile: roles.includes('official') ? {
        certLevel: '', certNumber: '', homeAddress: '',
        positions: [], joinedDate: new Date().toISOString(),
        totalGames: 0, seasonGames: 0,
      } : null,
      schedulerProfile: roles.includes('scheduler') ? {
        organization: '', licenseNumber: '',
        invoicePrefix: 'INV', nextInvoiceNumber: 1,
        subRoles,
      } : null,
      directorProfile: roles.includes('director') ? {
        organization: '', leagueName: '',
      } : null,
    }

    await setDoc(doc(db, 'users', cred.user.uid), profileData)
    setProfile(profileData)
    setActiveRole(roles[0])
    return cred.user
  }

  const signIn = async (email, password) => {
    // Clear existing state before signing in as a new user
    setUser(null)
    setProfile(null)
    setActiveRole(null)
    return signInWithEmailAndPassword(auth, email, password)
  }

  const logout = async () => {
    // Clear state immediately — don't wait for onAuthStateChanged
    setUser(null)
    setProfile(null)
    setActiveRole(null)
    await signOut(auth)
  }

  const switchRole = (role) => {
    if (profile?.roles?.includes(role)) {
      setActiveRole(role)
      localStorage.setItem(`refsync_role_${user.uid}`, role)
    }
  }

  // Add a new role to an existing account
  const addRole = async (newRole, newSubRoles = []) => {
    if (!user || !profile) return
    const updatedRoles    = [...new Set([...profile.roles, newRole])]
    const updatedSubRoles = [...new Set([...(profile.subRoles ?? []), ...newSubRoles])]

    const extra = {}
    if (newRole === 'official' && !profile.officialProfile) {
      extra.officialProfile = {
        certLevel: '', certNumber: '', homeAddress: '',
        positions: [], joinedDate: new Date().toISOString(),
        totalGames: 0, seasonGames: 0,
      }
    }
    if (newRole === 'scheduler' && !profile.schedulerProfile) {
      extra.schedulerProfile = {
        organization: '', licenseNumber: '',
        invoicePrefix: 'INV', nextInvoiceNumber: 1,
        subRoles: newSubRoles,
      }
    }
    if (newRole === 'director' && !profile.directorProfile) {
      extra.directorProfile = { organization: '', leagueName: '' }
    }

    await updateDoc(doc(db, 'users', user.uid), {
      roles: updatedRoles,
      subRoles: updatedSubRoles,
      ...extra,
      updatedAt: serverTimestamp(),
    })

    const updated = { ...profile, roles: updatedRoles, subRoles: updatedSubRoles, ...extra }
    setProfile(updated)
  }

  const refreshProfile = async () => {
    if (!user) return
    const snap = await getDoc(doc(db, 'users', user.uid))
    if (snap.exists()) setProfile(snap.data())
  }

  return (
    <AuthContext.Provider value={{
      user, profile, activeRole, loading,
      signUp, signIn, logout, switchRole, addRole, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
