import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { updateUser } from '@/services/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui'
import { Input, Textarea } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import styles from './ProfileEdit.module.css'

export default function ProfileEdit() {
  const { profile, user, refreshProfile } = useAuth()
  const [saving, setSaving]           = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoRef = useRef(null)
  const [form, setForm] = useState({
    displayName:  '',
    bio:          '',
    phone:        '',
    homeAddress:  '',
    certLevel:    '',
    certNumber:   '',
    jerseyNumber: '',
  })

  useEffect(() => {
    if (profile) {
      setForm({
        displayName:  profile.displayName ?? '',
        bio:          profile.bio ?? '',
        phone:        profile.phone ?? '',
        homeAddress:  profile.officialProfile?.homeAddress ?? '',
        certLevel:    profile.officialProfile?.certLevel ?? '',
        certNumber:   profile.officialProfile?.certNumber ?? '',
        jerseyNumber: profile.officialProfile?.jerseyNumber ?? '',
      })
    }
  }, [profile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Select an image file'); return }
    if (file.size > 5 * 1024 * 1024)    { toast.error('Image must be under 5MB'); return }
    setUploadingPhoto(true)
    try {
      const storageRef = ref(storage, `profilePhotos/${user.uid}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      await updateUser(user.uid, { photoURL: url })
      await refreshProfile()
      toast.success('Photo updated!')
    } catch { toast.error('Failed to upload photo') }
    finally { setUploadingPhoto(false) }
  }

  const handleSave = async () => {
    if (!form.displayName.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      await updateUser(user.uid, {
        displayName: form.displayName,
        bio: form.bio,
        phone: form.phone,
        officialProfile: {
          ...profile?.officialProfile,
          homeAddress:  form.homeAddress,
          certLevel:    form.certLevel,
          certNumber:   form.certNumber,
          jerseyNumber: form.jerseyNumber,
        },
      })
      await refreshProfile()
      toast.success('Profile saved!')
    } catch { toast.error('Failed to save profile') }
    finally { setSaving(false) }
  }

  const isOfficial = profile?.roles?.includes('official')

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Edit Profile</h1>

      <Card>
        <CardHeader><CardTitle>Profile Photo</CardTitle></CardHeader>
        <CardBody>
          <div className={styles.photoRow}>
            {uploadingPhoto ? (
              <div className={styles.photoSpinner}><Spinner size="md" /></div>
            ) : (
              <Avatar name={profile?.displayName} src={profile?.photoURL} size="lg" />
            )}
            <div>
              <Button variant="secondary" onClick={() => photoRef.current?.click()}>
                Change Photo
              </Button>
              <p className={styles.photoHint}>JPG, PNG or GIF · Max 5MB</p>
            </div>
          </div>
          <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Basic Info</CardTitle></CardHeader>
        <CardBody>
          <Input label="Full Name *" value={form.displayName} onChange={e => set('displayName', e.target.value)} />
          <Input label="Mobile Phone" type="tel" placeholder="+1 (615) 555-0123" hint="Used for SMS game reminders. Include country code." value={form.phone} onChange={e => set('phone', e.target.value)} />
          <Textarea label="Bio" rows={3} placeholder="Tell schedulers a bit about yourself…" value={form.bio} onChange={e => set('bio', e.target.value)} />
        </CardBody>
      </Card>

      {isOfficial && (
        <Card>
          <CardHeader><CardTitle>Official Info</CardTitle></CardHeader>
          <CardBody>
            <Input label="Home Address" hint="Used to calculate mileage to game venues" placeholder="123 Main St, Nashville TN 37201" value={form.homeAddress} onChange={e => set('homeAddress', e.target.value)} />
            <Input label="Certification Level" placeholder="e.g. USAH Level 3" value={form.certLevel} onChange={e => set('certLevel', e.target.value)} />
            <Input label="Certification Number" placeholder="e.g. 123456" value={form.certNumber} onChange={e => set('certNumber', e.target.value)} />
            <Input label="Jersey Number" placeholder="e.g. 42" value={form.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} />
          </CardBody>
        </Card>
      )}

      <div className={styles.saveRow}>
        <Button variant="primary" loading={saving} onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  )
}
