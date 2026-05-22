/**
 * services/firestore.js
 * All Firestore read/write operations, grouped by domain.
 * Import specific functions in components/hooks as needed.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, setDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
  increment, writeBatch, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── COLLECTION PATHS ────────────────────────────────────────────────────────
export const COLS = {
  users: 'users',
  games: 'games',
  gameGroups: 'gameGroups',
  assignments: 'assignments',
  availability: 'availability',
  connections: 'connections',
  invoices: 'invoices',
  expenses: 'expenses',
  news: 'news',
  notifications: 'notifications',
}

// ─── USERS ────────────────────────────────────────────────────────────────────
export const getUser = (uid) =>
  getDoc(doc(db, COLS.users, uid)).then((s) => s.exists() ? { id: s.id, ...s.data() } : null)

export const updateUser = (uid, data) =>
  updateDoc(doc(db, COLS.users, uid), { ...data, updatedAt: serverTimestamp() })

export const searchUsers = async (role, searchTerm = '') => {
  const q = query(
    collection(db, COLS.users),
    where('roles', 'array-contains', role)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => !searchTerm || u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()))
}

// ─── GAME GROUPS (created by Directors) ──────────────────────────────────────
export const createGameGroup = (data, uid) =>
  addDoc(collection(db, COLS.gameGroups), {
    ...data,
    directorId: uid,
    createdAt: serverTimestamp(),
    status: 'draft',
    totalGames: data.totalGames || 0,
    filledGames: 0,
  })

export const getGameGroup = (id) =>
  getDoc(doc(db, COLS.gameGroups, id)).then((s) => s.exists() ? { id: s.id, ...s.data() } : null)

export const subscribeGameGroups = (uid, role, callback) => {
  const field = role === 'director' ? 'directorId' : 'schedulerId'
  const q = query(
    collection(db, COLS.gameGroups),
    where(field, '==', uid),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const updateGameGroup = (id, data) =>
  updateDoc(doc(db, COLS.gameGroups, id), { ...data, updatedAt: serverTimestamp() })

// ─── GAMES ────────────────────────────────────────────────────────────────────
export const createGame = (data) =>
  addDoc(collection(db, COLS.games), {
    ...data,
    createdAt: serverTimestamp(),
    status: 'open',          // open | assigned | confirmed | completed | cancelled
    assignedOfficials: [],   // array of { uid, role, status: pending|accepted|declined }
  })

export const subscribeGames = (groupId, callback) => {
  const q = query(
    collection(db, COLS.games),
    where('groupId', '==', groupId),
    orderBy('gameDate', 'asc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const subscribeOfficialGames = (uid, callback) => {
  const q = query(
    collection(db, COLS.games),
    where('assignedUids', 'array-contains', uid),
    orderBy('gameDate', 'asc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const updateGame = (id, data) =>
  updateDoc(doc(db, COLS.games, id), { ...data, updatedAt: serverTimestamp() })

// ─── ASSIGNMENTS (official accepting/declining a game) ────────────────────────
export const assignOfficial = async (gameId, officialData, schedulerId) => {
  const batch = writeBatch(db)
  // update the game doc
  const gameRef = doc(db, COLS.games, gameId)
  batch.update(gameRef, {
    assignedOfficials: arrayUnion({ ...officialData, status: 'pending', assignedAt: new Date().toISOString() }),
    assignedUids: arrayUnion(officialData.uid),
    updatedAt: serverTimestamp(),
  })
  // create assignment record
  const assRef = doc(collection(db, COLS.assignments))
  batch.set(assRef, {
    gameId,
    officialId: officialData.uid,
    schedulerId,
    role: officialData.role,
    pay: officialData.pay,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
  await batch.commit()
  return assRef.id
}

export const respondToAssignment = async (gameId, officialId, response) => {
  // response: 'accepted' | 'declined'
  const gameRef = doc(db, COLS.games, gameId)
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const game = snap.data()
  const updated = game.assignedOfficials.map((o) =>
    o.uid === officialId ? { ...o, status: response } : o
  )
  await updateDoc(gameRef, {
    assignedOfficials: updated,
    status: updated.every((o) => o.status === 'accepted') ? 'confirmed' : 'assigned',
    updatedAt: serverTimestamp(),
  })
  // also update the assignments collection
  const q = query(
    collection(db, COLS.assignments),
    where('gameId', '==', gameId),
    where('officialId', '==', officialId)
  )
  const assSnap = await getDocs(q)
  assSnap.forEach((d) => updateDoc(d.ref, { status: response, respondedAt: serverTimestamp() }))
}

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────
export const setAvailabilityBlock = (uid, block) =>
  addDoc(collection(db, COLS.availability), {
    uid,
    ...block,
    createdAt: serverTimestamp(),
  })

export const subscribeAvailability = (uid, callback) => {
  const q = query(
    collection(db, COLS.availability),
    where('uid', '==', uid),
    orderBy('date', 'asc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const deleteAvailabilityBlock = (id) =>
  deleteDoc(doc(db, COLS.availability, id))

// Get all availability for a scheduler's roster (for assign view)
export const getRosterAvailability = async (officialIds, date) => {
  if (!officialIds.length) return []
  const q = query(
    collection(db, COLS.availability),
    where('uid', 'in', officialIds.slice(0, 30)), // Firestore in limit
    where('date', '==', date)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ─── CONNECTIONS (Scheduler ↔ Director, Scheduler ↔ Official) ────────────────
export const sendConnectionRequest = (fromUid, toUid, type, meta = {}) =>
  addDoc(collection(db, COLS.connections), {
    fromUid, toUid, type, // 'director-scheduler' | 'scheduler-official'
    status: 'pending',
    ...meta,
    createdAt: serverTimestamp(),
  })

export const respondToConnection = (connectionId, status) =>
  updateDoc(doc(db, COLS.connections, connectionId), {
    status, // 'accepted' | 'declined'
    respondedAt: serverTimestamp(),
  })

export const subscribeConnections = (uid, role, callback) => {
  const field = role === 'from' ? 'fromUid' : 'toUid'
  const q = query(
    collection(db, COLS.connections),
    where(field, '==', uid)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
export const createInvoice = (data, schedulerId) =>
  addDoc(collection(db, COLS.invoices), {
    ...data,
    schedulerId,
    status: 'draft',
    createdAt: serverTimestamp(),
  })

export const updateInvoice = (id, data) =>
  updateDoc(doc(db, COLS.invoices, id), { ...data, updatedAt: serverTimestamp() })

export const subscribeInvoices = (uid, role, callback) => {
  const field = role === 'scheduler' ? 'schedulerId' : 'directorId'
  const q = query(
    collection(db, COLS.invoices),
    where(field, '==', uid),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ─── EXPENSES (Officials) ──────────────────────────────────────────────────────
export const addExpense = (uid, data) =>
  addDoc(collection(db, COLS.expenses), {
    uid, ...data, createdAt: serverTimestamp(),
  })

export const subscribeExpenses = (uid, callback) => {
  const q = query(
    collection(db, COLS.expenses),
    where('uid', '==', uid),
    orderBy('date', 'desc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const deleteExpense = (id) => deleteDoc(doc(db, COLS.expenses, id))

// ─── NEWS / UPDATES (Scheduler posts) ─────────────────────────────────────────
export const createNewsPost = (schedulerId, data) =>
  addDoc(collection(db, COLS.news), {
    schedulerId, ...data, createdAt: serverTimestamp(), pinned: false,
  })

export const subscribeNews = (schedulerId, callback) => {
  const q = query(
    collection(db, COLS.news),
    where('schedulerId', '==', schedulerId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// Officials subscribe to news from their schedulers
export const subscribeNewsForOfficial = (schedulerIds, callback) => {
  if (!schedulerIds.length) { callback([]); return () => {} }
  const q = query(
    collection(db, COLS.news),
    where('schedulerId', 'in', schedulerIds.slice(0, 10)),
    orderBy('createdAt', 'desc'),
    limit(20)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const deleteNews = (id) => deleteDoc(doc(db, COLS.news, id))
export const updateNews = (id, data) =>
  updateDoc(doc(db, COLS.news, id), { ...data, updatedAt: serverTimestamp() })
