import { useNavigate } from 'react-router-dom'
import { Edit2, ChevronRight, Bell, Ruler, LogOut, Shield, HelpCircle } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { getUser, clearAuth } from '../../lib/auth'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function ProfilePage() {
  const navigate = useNavigate()
  const user = getUser()
  const name = user?.name ?? 'Athlete'
  const email = user?.email ?? ''

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="phone-shell">
      {/* Header */}
      <header className="app-header">
        <span className="header-title">Profile</span>
        <button className="header-icon-btn" aria-label="Edit profile">
          <Edit2 size={18} />
        </button>
      </header>

      <div className="content">
        {/* User card */}
        <div className="profile-user-card">
          <div className="profile-avatar">{getInitials(name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">{name}</div>
            <div className="profile-meta">{email}</div>
            {user?.role && (
              <span
                className={`pill ${user.role === 'admin' ? 'pill-primary' : 'pill-muted'}`}
                style={{ marginTop: 6 }}
              >
                {user.role}
              </span>
            )}
          </div>
          <button
            className="header-action-btn"
            style={{ flexShrink: 0 }}
            aria-label="Edit profile"
          >
            Edit
          </button>
        </div>

        {/* Preferences */}
        <div className="settings-group">
          <div className="settings-group-label">Preferences</div>
          <div className="settings-row">
            <span className="settings-row-label">
              <Ruler size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
              Units
            </span>
            <div className="settings-row-value">
              kg / km
              <ChevronRight size={16} />
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">
              <Bell size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
              Notifications
            </span>
            <div className="settings-row-value">
              On
              <ChevronRight size={16} />
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="settings-group">
          <div className="settings-group-label">Account</div>
          <div className="settings-row">
            <span className="settings-row-label">
              <Shield size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
              Privacy &amp; Security
            </span>
            <div className="settings-row-value">
              <ChevronRight size={16} />
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">
              <HelpCircle size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
              Help &amp; Support
            </span>
            <div className="settings-row-value">
              <ChevronRight size={16} />
            </div>
          </div>
          <div
            className="settings-row"
            onClick={handleLogout}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLogout() }}
            aria-label="Log out"
          >
            <span className="settings-row-label danger">
              <LogOut size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Log out
            </span>
          </div>
        </div>

        <div className="version-text">fitapp v0.1.0</div>
      </div>

      <BottomNav />
    </div>
  )
}
