import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeRole, setActiveRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)
          // restore last active role from localStorage
          const saved = localStorage.getItem(`refsync_role_${firebaseUser.uid}`)
          const role = saved && data.roles?.includes(saved) ? saved : data.roles?.[0]
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

  const signUp = async ({ email, password, displayName, roles, sport = 'hockey' }) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    const profileData = {
      uid: cred.user.uid,
      displayName,
      email,
      roles,
      sport,
      createdAt: serverTimestamp(),
      // role-specific sub-profiles populated on first use
      officialProfile: roles.includes('official') ? {
        certLevel: '',
        certNumber: '',
        homeAddress: '',
        jerseyNumber: '',
        positions: [],   // referee, linesman, scorekeeper
        joinedDate: new Date().toISOString(),
        totalGames: 0,
        seasonGames: 0,
      } : null,
      schedulerProfile: roles.includes('scheduler') ? {
        organization: '',
        licenseNumber: '',
        invoicePrefix: 'INV',
        nextInvoiceNumber: 1,
      } : null,
      directorProfile: roles.includes('director') ? {
        organization: '',
        leagueName: '',
      } : null,
    }
    await setDoc(doc(db, 'users', cred.user.uid), profileData)
    setProfile(profileData)
    setActiveRole(roles[0])
    return cred.user
  }

  const signIn = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return cred.user
  }

  const logout = () => signOut(auth)

  const switchRole = (role) => {
    if (profile?.roles?.includes(role)) {
      setActiveRole(role)
      localStorage.setItem(`refsync_role_${user.uid}`, role)
    }
  }

  const refreshProfile = async () => {
    if (!user) return
    const snap = await getDoc(doc(db, 'users', user.uid))
    if (snap.exists()) setProfile(snap.data())
  }

  return (
    <AuthContext.Provider value={{
      user, profile, activeRole, loading,
      signUp, signIn, logout, switchRole, refreshProfile,
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
