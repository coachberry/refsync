import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useOfficialGames } from '@/hooks/useGames'
import { db, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import { updateUser } from '@/services/firestore'
import { respondToConnection } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format, differenceInYears, differenceInMonths } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './OfficialProfile.module.css'

const SUB_ROLE_LABELS = {
  referee:     { label: 'Referee',     icon: '🏒', color: 'var(--red)'  },
  scorekeeper: { label: 'Scorekeeper', icon: '📋', color: 'var(--teal)' },
}

export default function OfficialProfile() {
  const { profile, user, refreshProfile } = useAuth()
  const { isReferee, isScorekeeper } = useSubRoles()
  const { games } = useOfficialGames()
  const [rosters, setRosters]         = useState([])
  const [loadingRosters, setLoadingRosters] = useState(true)
  const [leaving, setLeaving]         = useState(null)
  const [showEdit, setShowEdit]       = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const fetchRosters = async () => {
      setLoadingRosters(true)
      try {
        const q = query(
          collection(db, 'connections'),
          where('toUid', '==', user.uid),
          where('type', '==', 'scheduler-official'),
          where('status', '==', 'accepted')
        )
        const snap = await getDocs(q)
        const connections = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const withProfiles = await Promise.all(
          connections.map(async conn => {
            try {
              const s = await getDoc(doc(db, 'users', conn.fromUid))
              const sd = s.exists() ? s.data() : {}
              return { ...conn, schedulerName: sd.displayName ?? conn.fromName ?? 'Scheduler', schedulerOrg: sd.schedulerProfile?.organization ?? '' }
            } catch { return { ...conn, schedulerName: conn.fromName ?? 'Scheduler', schedulerOrg: '' } }
          })
        )
        setRosters(withProfiles)
      } catch { toast.error('Failed to load rosters') }
      finally { setLoadingRosters(false) }
    }
    fetchRosters()
  }, [user])

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    setUploadingPhoto(true)
    try {
      const storageRef = ref(storage, `profilePhotos/${user.uid}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      await updateUser(user.uid, { photoURL: url })
      await refreshProfile()
      toast.success('Profile photo updated!')
    } catch { toast.error('Failed to upload photo') }
    finally { setUploadingPhoto(false) }
  }

  const handleLeave = async (connectionId, schedulerName) => {
    if (!window.confirm(`Remove yourself from ${schedulerName}'s roster?`)) return
    setLeaving(connectionId)
    try {
      await respondToConnection(connectionId, 'declined')
      setRosters(rs => rs.filter(r => r.id !== connectionId))
      toast.success(`Removed from ${schedulerName}'s roster`)
    } catch { toast.error('Failed to leave roster') }
    finally { setLeaving(null) }
  }

  const joinedDate = profile?.officialProfile?.joinedDate
  const memberDuration = () => {
    if (!joinedDate) return '—'
    const joined = new Date(joinedDate)
    const years  = differenceInYears(new Date(), joined)
    const months = differenceInMonths(new Date(), joined) % 12
    if (years > 0) return `${years} yr${years > 1 ? 's' : ''}${months > 0 ? ` ${months} mo` : ''}`
    return `${months} month${months !== 1 ? 's' : ''}`
  }

  const totalGames = games.length
  const refGames   = games.filter(g => g.assignedOfficials?.find(o => o.uid === user?.uid && o.role !== 'Scorekeeper')).length
  const skGames    = games.filter(g => g.assignedOfficials?.find(o => o.uid === user?.uid && o.role === 'Scorekeeper')).length

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>My Profile</h1>

      {/* Profile header card */}
      <Card>
        <CardBody>
          <div className={styles.profileHeader}>
            {/* Avatar with upload button */}
            <div className={styles.avatarWrap}>
              {uploadingPhoto ? (
                <div className={styles.avatarSpinner}><Spinner size="md" color="white" /></div>
              ) : (
                <Avatar name={profile?.displayName} src={profile?.photoURL} size="xl" />
              )}
              <button
                className={styles.avatarEditBtn}
                onClick={() => photoInputRef.current?.click()}
                title="Change profile photo"
              >
                📷
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoUpload}
              />
            </div>

            <div className={styles.profileInfo}>
              <div className={styles.profileName}>{profile?.displayName}</div>
              <div className={styles.profileEmail}>{profile?.email}</div>
              <div className={styles.profileBadges}>
                {isReferee     && <Badge variant="red">🏒 Referee</Badge>}
                {isScorekeeper && <Badge variant="blue">📋 Scorekeeper</Badge>}
              </div>
            </div>

            <div className={styles.profileMeta}>
              <div className={styles.metaItem}>
                <div className={styles.metaValue}>{memberDuration()}</div>
                <div className={styles.metaLabel}>Member</div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaValue}>{totalGames}</div>
                <div className={styles.metaLabel}>Games</div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaValue}>{rosters.length}</div>
                <div className={styles.metaLabel}>Rosters</div>
              </div>
            </div>
          </div>
          <div className={styles.profileActions}>
            <Button variant="secondary" onClick={() => setShowEdit(true)}>Edit Profile</Button>
          </div>
        </CardBody>
      </Card>

      {/* Season stats — no ratings */}
      <div className={styles.statsRow}>
        {isReferee && (
          <Card>
            <CardBody>
              <div className={styles.statBlock}>
                <div className={styles.statIcon}>🏒</div>
                <div className={styles.statValue}>{refGames}</div>
                <div className={styles.statLabel}>Referee Games</div>
                <div className={styles.statSub}>This season</div>
              </div>
            </CardBody>
          </Card>
        )}
        {isScorekeeper && (
          <Card>
            <CardBody>
              <div className={styles.statBlock}>
                <div className={styles.statIcon}>📋</div>
                <div className={styles.statValue}>{skGames}</div>
                <div className={styles.statLabel}>Scorekeeper Games</div>
                <div className={styles.statSub}>This season</div>
              </div>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardBody>
            <div className={styles.statBlock}>
              <div className={styles.statIcon}>🏆</div>
              <div className={styles.statValue}>{totalGames}</div>
              <div className={styles.statLabel}>Career Games</div>
              <div className={styles.statSub}>All time</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* My Rosters */}
      <Card>
        <CardHeader>
          <CardTitle>My Rosters</CardTitle>
          {rosters.length > 0 && <Badge variant="green">{rosters.length} active</Badge>}
        </CardHeader>
        <CardBody noPadding>
          {loadingRosters ? (
            <div className={styles.center}><Spinner /></div>
          ) : rosters.length === 0 ? (
            <EmptyState icon="👥" title="Not on any rosters yet" message="When a scheduler adds you to their roster and you accept, it will appear here." />
          ) : (
            rosters.map(roster => {
              const officialSubRoles = (profile?.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s))
              return (
                <div key={roster.id} className={styles.rosterRow}>
                  <Avatar name={roster.schedulerName} size="md" />
                  <div className={styles.rosterInfo}>
                    <div className={styles.rosterName}>{roster.schedulerName}</div>
                    {roster.schedulerOrg && <div className={styles.rosterOrg}>{roster.schedulerOrg}</div>}
                    <div className={styles.rosterRoles}>
                      {officialSubRoles.map(role => {
                        const meta = SUB_ROLE_LABELS[role]
                        return (
                          <span key={role} className={styles.rosterRoleBadge} style={{ background: `${meta.color}12`, color: meta.color, borderColor: `${meta.color}30` }}>
                            {meta.icon} {meta.label}
                          </span>
                        )
                      })}
                    </div>
                    {roster.createdAt && (
                      <div className={styles.rosterSince}>
                        Since {format(roster.createdAt.toDate?.() ?? new Date(roster.createdAt), 'MMM yyyy')}
                      </div>
                    )}
                  </div>
                  <div className={styles.rosterActions}>
                    <Badge variant="green">Active</Badge>
                    <Button size="sm" variant="danger" loading={leaving === roster.id} onClick={() => handleLeave(roster.id, roster.schedulerName)}>
                      Leave
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardBody>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader><CardTitle>Certifications & Info</CardTitle></CardHeader>
        <CardBody>
          <div className={styles.certGrid}>
            <div className={styles.certItem}><div className={styles.certLabel}>Cert Level</div><div className={styles.certValue}>{profile?.officialProfile?.certLevel || '—'}</div></div>
            <div className={styles.certItem}><div className={styles.certLabel}>Cert Number</div><div className={styles.certValue}>{profile?.officialProfile?.certNumber || '—'}</div></div>
            <div className={styles.certItem}><div className={styles.certLabel}>Home Address</div><div className={styles.certValue}>{profile?.officialProfile?.homeAddress || '—'}</div></div>
            <div className={styles.certItem}><div className={styles.certLabel}>Member Since</div><div className={styles.certValue}>{joinedDate ? format(new Date(joinedDate), 'MMMM yyyy') : '—'}</div></div>
          </div>
        </CardBody>
      </Card>

      {/* Edit Profile Modal */}
      <EditProfileModal open={showEdit} onClose={() => setShowEdit(false)} profile={profile} userId={user?.uid} onSaved={refreshProfile} />
    </div>
  )
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────
function EditProfileModal({ open, onClose, profile, userId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    displayName:  profile?.displayName ?? '',
    certLevel:    profile?.officialProfile?.certLevel ?? '',
    certNumber:   profile?.officialProfile?.certNumber ?? '',
    homeAddress:  profile?.officialProfile?.homeAddress ?? '',
    jerseyNumber: profile?.officialProfile?.jerseyNumber ?? '',
    bio:          profile?.bio ?? '',
  })

  // Sync form when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        displayName:  profile.displayName ?? '',
        certLevel:    profile.officialProfile?.certLevel ?? '',
        certNumber:   profile.officialProfile?.certNumber ?? '',
        homeAddress:  profile.officialProfile?.homeAddress ?? '',
        jerseyNumber: profile.officialProfile?.jerseyNumber ?? '',
        bio:          profile.bio ?? '',
      })
    }
  }, [profile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.displayName.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      await updateUser(userId, {
        displayName: form.displayName,
        bio: form.bio,
        officialProfile: {
          ...profile?.officialProfile,
          certLevel:    form.certLevel,
          certNumber:   form.certNumber,
          homeAddress:  form.homeAddress,
          jerseyNumber: form.jerseyNumber,
        },
      })
      await onSaved()
      toast.success('Profile updated!')
      onClose()
    } catch { toast.error('Failed to save profile') }
    finally { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Profile"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>Save Changes</Button>
        </>
      }
    >
      <Input label="Full Name *" value={form.displayName} onChange={e => set('displayName', e.target.value)} />
      <Input label="Home Address" hint="Used for mileage calculations" placeholder="123 Main St, Nashville TN" value={form.homeAddress} onChange={e => set('homeAddress', e.target.value)} />
      <Input label="Certification Level" placeholder="e.g. USAH Level 3" value={form.certLevel} onChange={e => set('certLevel', e.target.value)} />
      <Input label="Certification Number" placeholder="e.g. 123456" value={form.certNumber} onChange={e => set('certNumber', e.target.value)} />
      <Input label="Jersey Number" placeholder="e.g. 42" value={form.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} />
      <Textarea label="Bio" placeholder="A short bio about yourself..." rows={3} value={form.bio} onChange={e => set('bio', e.target.value)} />
    </Modal>
  )
}
