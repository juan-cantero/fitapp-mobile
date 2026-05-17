import { Link } from 'react-router-dom'
import { getUser } from '../lib/auth'

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

interface AppHeaderProps {
  title: React.ReactNode
  action?: React.ReactNode
}

export function AppHeader({ title, action }: AppHeaderProps) {
  const user = getUser()

  return (
    <header className="app-header">
      <span className="header-title">{title}</span>
      {action ?? (
        <Link
          to="/profile"
          aria-label="Perfil"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          {user ? initials(user.name) : '?'}
        </Link>
      )}
    </header>
  )
}
