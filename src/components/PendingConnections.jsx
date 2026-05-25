/**
 * PendingConnections — shared component shown on all role dashboards.
 * Shows incoming connection requests with Accept / Decline buttons.
 * Filters by connection type so each role only sees relevant requests.
 */
import { useConnections } from '@/hooks/useConnections'
import { Card, CardHeader, CardTitle, CardBody, Badge } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import styles from './PendingConnections.module.css'

const TYPE_LABELS = {
  'scheduler-official':  { icon: '📋', who: 'Scheduler', action: 'wants you to join their roster' },
  'director-scheduler':  { icon: '🏒', who: 'Game Director', action: 'wants to connect with you' },
  'scheduler-director':  { icon: '📋', who: 'Scheduler', action: 'wants to connect with you' },
}

export default function PendingConnections({ filterTypes, emptyMessage }) {
  const { pendingIncoming, accept, decline } = useConnections()

  const filtered = filterTypes
    ? pendingIncoming.filter(c => filterTypes.includes(c.type))
    : pendingIncoming

  if (!filtered.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>🤝 Pending Connections</CardTitle>
        <Badge variant="amber">{filtered.length} pending</Badge>
      </CardHeader>
      <CardBody noPadding>
        {filtered.map(conn => {
          const meta = TYPE_LABELS[conn.type] ?? { icon: '🤝', who: 'User', action: 'wants to connect' }
          return (
            <div key={conn.id} className={styles.row}>
              <Avatar name={conn.fromName ?? meta.who} size="md" />
              <div className={styles.info}>
                <div className={styles.name}>{conn.fromName ?? meta.who}</div>
                <div className={styles.action}>{meta.action}</div>
                {conn.groupName && <div className={styles.sub}>Event: {conn.groupName}</div>}
                {conn.organization && <div className={styles.sub}>{conn.organization}</div>}
                {conn.note && <div className={styles.note}>"{conn.note}"</div>}
              </div>
              <div className={styles.actions}>
                <Button variant="teal"  size="sm" onClick={() => accept(conn.id)}>Accept</Button>
                <Button variant="ghost" size="sm" onClick={() => decline(conn.id)}>Decline</Button>
              </div>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
