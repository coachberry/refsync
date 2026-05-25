import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, CardHeader, CardTitle, CardBody, Badge } from '@/components/ui'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import styles from './AddRole.module.css'

const ALL_ROLES = [
  {
    id: 'director',
    icon: '🏆',
    name: 'Game Director',
    desc: 'Post games, request schedulers, manage your event or league',
    color: 'var(--blue)',
    subRoles: [],
  },
  {
    id: 'scheduler',
    icon: '📋',
    name: 'Scheduler',
    desc: 'Assign officials to games, manage rosters, handle payroll & invoicing',
    color: 'var(--teal)',
    subRoles: [
      { id: 'ref_scheduler', label: 'Referee Scheduler', desc: 'Schedule and manage referees' },
      { id: 'sk_scheduler',  label: 'Scorekeeper Scheduler', desc: 'Schedule and manage scorekeepers' },
    ],
  },
  {
    id: 'official',
    icon: '🏒',
    name: 'Official',
    desc: 'Accept game assignments, manage your schedule, track earnings & mileage',
    color: 'var(--red)',
    subRoles: [
      { id: 'referee',     label: 'Referee',     desc: 'Officiate games on the ice' },
      { id: 'scorekeeper', label: 'Scorekeeper', desc: 'Keep score and manage game sheets' },
    ],
  },
]

const SUB_ROLE_LABELS = {
  ref_scheduler: 'Referee Scheduler',
  sk_scheduler:  'Scorekeeper Scheduler',
  referee:       'Referee',
  scorekeeper:   'Scorekeeper',
}

export default function AddRole() {
  const { profile, addRole, switchRole } = useAuth()
  const [saving, setSaving]       = useState(null)
  const [newSubRoles, setNewSubRoles] = useState([])
  const [expandedRole, setExpandedRole] = useState(null)

  const existingRoles    = profile?.roles    ?? []
  const existingSubRoles = profile?.subRoles ?? []

  const toggleSubRole = (id) =>
    setNewSubRoles(ss => ss.includes(id) ? ss.filter(x => x !== id) : [...ss, id])

  const handleAdd = async (roleId) => {
    const role = ALL_ROLES.find(r => r.id === roleId)

    // If role has sub-roles and none selected yet, expand to show them
    if (role.subRoles.length > 0 && expandedRole !== roleId) {
      setExpandedRole(roleId)
      setNewSubRoles([])
      return
    }

    // Validate sub-role selection
    if (role.subRoles.length > 0) {
      const hasOne = role.subRoles.some(sr => newSubRoles.includes(sr.id))
      if (!hasOne) { toast.error(`Choose at least one type for ${role.name}`); return }
    }

    setSaving(roleId)
    try {
      await addRole(roleId, newSubRoles)
      toast.success(`${role.name} role added!`)
      setExpandedRole(null)
      setNewSubRoles([])
    } catch {
      toast.error('Failed to add role')
    } finally {
      setSaving(null)
    }
  }

  // Roles the user doesn't have yet
  const availableRoles = ALL_ROLES.filter(r => !existingRoles.includes(r.id))

  // Sub-roles the user could add to existing roles
  const addableSubRoles = ALL_ROLES
    .filter(r => existingRoles.includes(r.id))
    .flatMap(r => r.subRoles.filter(sr => !existingSubRoles.includes(sr.id)))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Account Roles</h1>
        <p className={styles.sub}>Manage the roles attached to your account</p>
      </div>

      {/* Current roles */}
      <Card>
        <CardHeader><CardTitle>Your Current Roles</CardTitle></CardHeader>
        <CardBody>
          <div className={styles.currentRoles}>
            {existingRoles.map(roleId => {
              const role = ALL_ROLES.find(r => r.id === roleId)
              if (!role) return null
              const mySubs = existingSubRoles.filter(s =>
                role.subRoles.some(sr => sr.id === s)
              )
              return (
                <div key={roleId} className={styles.currentRole} style={{ borderColor: role.color }}>
                  <div className={styles.currentRoleIcon}>{role.icon}</div>
                  <div className={styles.currentRoleInfo}>
                    <div className={styles.currentRoleName}>{role.name}</div>
                    {mySubs.length > 0 && (
                      <div className={styles.currentRoleSubs}>
                        {mySubs.map(s => (
                          <Badge key={s} variant="gray">{SUB_ROLE_LABELS[s]}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant="green">Active</Badge>
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>

      {/* Add sub-roles to existing roles */}
      {addableSubRoles.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Add to Existing Roles</CardTitle></CardHeader>
          <CardBody>
            <p className={styles.hint}>You can expand your existing roles with additional types.</p>
            <div className={styles.subRoleList}>
              {addableSubRoles.map(sr => {
                const parentRole = ALL_ROLES.find(r => r.subRoles.some(s => s.id === sr.id))
                return (
                  <div key={sr.id} className={styles.subRoleRow}>
                    <div>
                      <div className={styles.subRoleName}>{sr.label}</div>
                      <div className={styles.subRoleDesc}>{sr.desc} · under {parentRole?.name}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={saving === sr.id}
                      onClick={async () => {
                        setSaving(sr.id)
                        try {
                          await addRole(parentRole.id, [sr.id])
                          toast.success(`${sr.label} added!`)
                        } catch {
                          toast.error('Failed to add')
                        } finally {
                          setSaving(null)
                        }
                      }}
                    >
                      + Add
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Add new roles */}
      {availableRoles.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Add a New Role</CardTitle></CardHeader>
          <CardBody>
            <p className={styles.hint}>Adding a role gives you access to a new dashboard under the same login.</p>
            <div className={styles.roleList}>
              {availableRoles.map(role => (
                <div key={role.id} className={styles.roleOption}>
                  <div className={styles.roleOptionTop}>
                    <div className={styles.roleOptionIcon}>{role.icon}</div>
                    <div className={styles.roleOptionInfo}>
                      <div className={styles.roleOptionName}>{role.name}</div>
                      <div className={styles.roleOptionDesc}>{role.desc}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={saving === role.id}
                      onClick={() => handleAdd(role.id)}
                    >
                      {expandedRole === role.id ? 'Confirm →' : '+ Add Role'}
                    </Button>
                  </div>

                  {/* Sub-role picker */}
                  {expandedRole === role.id && role.subRoles.length > 0 && (
                    <div className={styles.subRolePicker}>
                      <p className={styles.subRolePickerLabel}>Select your type(s) for {role.name}:</p>
                      {role.subRoles.map(sr => {
                        const picked = newSubRoles.includes(sr.id)
                        return (
                          <div
                            key={sr.id}
                            className={styles.subRolePickerItem}
                            style={{
                              borderColor: picked ? role.color : 'var(--color-border)',
                              background: picked ? `${role.color}08` : 'var(--color-surface-2)',
                            }}
                            onClick={() => toggleSubRole(sr.id)}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                              border: `2px solid ${picked ? role.color : 'var(--color-border)'}`,
                              background: picked ? role.color : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {picked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{sr.label}</div>
                              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{sr.desc}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-muted)', fontSize: 14 }}>
              🎉 You have all available roles on your account.
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
