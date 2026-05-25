/**
 * services/firestore.js
 * All Firestore read/write operations, grouped by domain.
 * Import specific functions in components/hooks as needed.
 *
 * NOTE: orderBy has been removed from compound queries to avoid
 * requiring composite Firestore indexes during development.
 * Add indexes and restore orderBy before production.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, setDoc, query, where,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
  increment, writeBatch, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── COLLECTION PATHS ────────────────────────────────────────────────────────
export const COLS = {
  users:         'users',
  games:         'games',
  gameGroups:    'gameGroups',
  assignments:   'assignments',
  availability:  'availability',
  connections:   'connections',
  invoices:      'invoices',
  expenses:      'expenses',
  news:          'news',
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
    where(field, '==', uid)
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
    status: 'open',
    assignedOfficials: [],
  })

export const subscribeGames = (groupId, callback) => {
  const q = query(
    collection(db, COLS.games),
    where('groupId', '==', groupId)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const subscribeOfficialGames = (uid, callback) => {
  const q = query(
    collection(db, COLS.games),
    where('assignedUids', 'array-contains', uid)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const updateGame = (id, data) =>
  updateDoc(doc(db, COLS.games, id), { ...data, updatedAt: serverTimestamp() })

// ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────
export const assignOfficial = async (gameId, officialData, schedulerId) => {
  const batch = writeBatch(db)
  const gameRef = doc(db, COLS.games, gameId)
  batch.update(gameRef, {
    assignedOfficials: arrayUnion({ ...officialData, status: 'pending', assignedAt: new Date().toISOString() }),
    assignedUids: arrayUnion(officialData.uid),
    updatedAt: serverTimestamp(),
  })
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
    uid, ...block, createdAt: serverTimestamp(),
  })

export const subscribeAvailability = (uid, callback) => {
  const q = query(
    collection(db, COLS.availability),
    where('uid', '==', uid)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const deleteAvailabilityBlock = (id) =>
  deleteDoc(doc(db, COLS.availability, id))

export const getRosterAvailability = async (officialIds, date) => {
  if (!officialIds.length) return []
  const q = query(
    collection(db, COLS.availability),
    where('uid', 'in', officialIds.slice(0, 30)),
    where('date', '==', date)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ─── CONNECTIONS ──────────────────────────────────────────────────────────────
export const sendConnectionRequest = (fromUid, toUid, type, meta = {}) =>
  addDoc(collection(db, COLS.connections), {
    fromUid, toUid, type,
    status: 'pending',
    ...meta,
    createdAt: serverTimestamp(),
  })

export const respondToConnection = (connectionId, status) =>
  updateDoc(doc(db, COLS.connections, connectionId), {
    status,
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
    ...data, schedulerId, status: 'draft', createdAt: serverTimestamp(),
  })

export const updateInvoice = (id, data) =>
  updateDoc(doc(db, COLS.invoices, id), { ...data, updatedAt: serverTimestamp() })

export const subscribeInvoices = (uid, role, callback) => {
  const field = role === 'scheduler' ? 'schedulerId' : 'directorId'
  const q = query(
    collection(db, COLS.invoices),
    where(field, '==', uid)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
export const addExpense = (uid, data) =>
  addDoc(collection(db, COLS.expenses), {
    uid, ...data, createdAt: serverTimestamp(),
  })

export const subscribeExpenses = (uid, callback) => {
  const q = query(
    collection(db, COLS.expenses),
    where('uid', '==', uid)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const deleteExpense = (id) => deleteDoc(doc(db, COLS.expenses, id))

// ─── NEWS ─────────────────────────────────────────────────────────────────────
export const createNewsPost = (schedulerId, data) =>
  addDoc(collection(db, COLS.news), {
    schedulerId, ...data, createdAt: serverTimestamp(), pinned: false,
  })

export const subscribeNews = (schedulerId, callback) => {
  const q = query(
    collection(db, COLS.news),
    where('schedulerId', '==', schedulerId)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const subscribeNewsForOfficial = (schedulerIds, callback) => {
  if (!schedulerIds.length) { callback([]); return () => {} }
  const q = query(
    collection(db, COLS.news),
    where('schedulerId', 'in', schedulerIds.slice(0, 10)),
    limit(20)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const deleteNews = (id) => deleteDoc(doc(db, COLS.news, id))
export const updateNews = (id, data) =>
  updateDoc(doc(db, COLS.news, id), { ...data, updatedAt: serverTimestamp() })

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export const createNotification = (uid, data) =>
  addDoc(collection(db, COLS.notifications), {
    uid, ...data, read: false, createdAt: serverTimestamp(),
  })

export const subscribeNotifications = (uid, callback) => {
  const q = query(
    collection(db, COLS.notifications),
    where('uid', '==', uid),
    limit(30)
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export const markNotificationRead = (id) =>
  updateDoc(doc(db, COLS.notifications, id), { read: true })

export const markAllNotificationsRead = async (uid) => {
  const q = query(
    collection(db, COLS.notifications),
    where('uid', '==', uid),
    where('read', '==', false)
  )
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.forEach(d => batch.update(d.ref, { read: true }))
  await batch.commit()
}

// ─── QUOTES ───────────────────────────────────────────────────────────────────
export const createQuote = (data) =>
  addDoc(collection(db, 'quotes'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  })

export const updateQuote = (id, data) =>
  updateDoc(doc(db, 'quotes', id), { ...data, updatedAt: serverTimestamp() })

export const subscribeQuotesForGroup = (groupId, callback) => {
  const q = query(
    collection(db, 'quotes'),
    where('groupId', '==', groupId)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export const subscribeQuotesForScheduler = (schedulerUid, callback) => {
  const q = query(
    collection(db, 'quotes'),
    where('schedulerUid', '==', schedulerUid)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

// ─── RFQ NOTIFICATIONS ────────────────────────────────────────────────────────
export const sendRFQ = async (groupId, groupData, schedulerUids, directorUid, directorName) => {
  const batch = writeBatch(db)

  schedulerUids.forEach(uid => {
    // Create RFQ record
    const rfqRef = doc(collection(db, 'rfqs'))
    batch.set(rfqRef, {
      groupId,
      groupName:    groupData.name,
      directorUid,
      directorName,
      schedulerUid: uid,
      status:       'open',
      gameCount:    groupData.totalGames ?? 0,
      totalHours:   groupData.totalHours ?? 0,
      sport:        groupData.sport ?? 'Ice Hockey',
      startDate:    groupData.startDate ?? null,
      endDate:      groupData.endDate ?? null,
      venues:       groupData.venues ?? [],
      divisions:    groupData.divisions ?? [],
      officialsNeeded: groupData.officialsNeeded ?? 'both',
      budget:       groupData.budget ?? null,
      notes:        groupData.notes ?? '',
      createdAt:    serverTimestamp(),
    })

    // In-app notification for scheduler
    const notifRef = doc(collection(db, 'notifications'))
    batch.set(notifRef, {
      uid:       uid,
      type:      'rfq',
      title:     '📋 New Quote Request',
      message:   `${directorName} wants you to quote for "${groupData.name}" — ${groupData.totalGames ?? 0} games`,
      read:      false,
      link:      '/scheduler/quotes',
      groupId,
      directorUid,
      createdAt: serverTimestamp(),
    })
  })

  await batch.commit()
}

export const sendRFQByEmail = async (groupId, groupData, email, directorUid, directorName) => {
  // Look up user by email
  const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()))
  const snap = await getDocs(q)

  if (!snap.empty) {
    // User exists — send them an RFQ + notification directly
    const schedulerUid = snap.docs[0].id
    await sendRFQ(groupId, groupData, [schedulerUid], directorUid, directorName)
    return { found: true, uid: schedulerUid }
  }

  // User not found — record a pending invite
  const inviteRef = doc(collection(db, 'rfqs'))
  await setDoc(inviteRef, {
    groupId,
    groupName:    groupData.name,
    directorUid,
    directorName,
    inviteEmail:  email.toLowerCase().trim(),
    schedulerUid: null,
    status:       'invited',
    gameCount:    groupData.totalGames ?? 0,
    totalHours:   groupData.totalHours ?? 0,
    budget:       groupData.budget ?? null,
    notes:        groupData.notes ?? '',
    createdAt:    serverTimestamp(),
  })
  return { found: false, uid: null }
}

export const subscribeRFQsForScheduler = (schedulerUid, callback) => {
  const q = query(
    collection(db, 'rfqs'),
    where('schedulerUid', '==', schedulerUid)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export const subscribeRFQsForDirector = (directorUid, callback) => {
  const q = query(
    collection(db, 'rfqs'),
    where('directorUid', '==', directorUid)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export const subscribeRFQsForGroup = (groupId, callback) => {
  const q = query(
    collection(db, 'rfqs'),
    where('groupId', '==', groupId)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export const updateRFQ = (id, data) =>
  updateDoc(doc(db, 'rfqs', id), { ...data, updatedAt: serverTimestamp() })
