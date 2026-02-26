import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Flame, Clock, Dumbbell, TrendingUp, ChevronRight, Play } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { getUser } from '../../lib/auth'
import { getMyStats, listMyWorkouts, getMySessions } from '../../lib/api'
import type { UserStats, Workout, Session } from '../../lib/api'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`
  return `${kg}`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.round(seconds / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m} min`
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === now.toDateString()) {
    return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const SESSION_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5AC8FA', '#BF5AF2']

export function HomePage() {
  const navigate = useNavigate()
  const user = getUser()
  const firstName = user?.name?.split(' ')[0] ?? 'Athlete'

  const [stats, setStats] = useState<UserStats | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getMyStats(),
      listMyWorkouts(1, 5),
      getMySessions(1, 3),
    ])
      .then(([s, w, sess]) => {
        setStats(s)
        setWorkouts(w.data)
        setSessions(sess.data)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="phone-shell">
      <header className="app-header">
        <span className="header-title">{getGreeting()}, {firstName} 👋</span>
        <button className="header-icon-btn" aria-label="Notifications">
          <Bell size={20} />
        </button>
      </header>

      <div className="content">
        {/* Streak banner */}
        <div className="streak-banner">
          <div className="streak-label">
            {stats ? `🔥 ${stats.currentStreak}-day streak!` : '🔥 Keep it up!'}
          </div>
          <div className="streak-sub">
            {stats && stats.currentStreak > 0
              ? `You've trained ${stats.currentStreak} days in a row. Keep the momentum!`
              : 'Start training today to build your streak.'}
          </div>
          <button className="streak-btn" onClick={() => navigate('/workouts')}>
            <Play size={14} />
            Start Training
          </button>
        </div>

        {/* Quick stats */}
        <div className="scroll-row">
          <div className="stat-chip">
            <Dumbbell size={16} color="var(--primary)" />
            <div>
              <div className="stat-chip-value">{isLoading ? '—' : (stats?.totalSessions ?? 0)}</div>
              <div className="stat-chip-label">Sessions</div>
            </div>
          </div>
          <div className="stat-chip">
            <Flame size={16} color="var(--primary)" />
            <div>
              <div className="stat-chip-value">{isLoading ? '—' : (stats?.weeklyCount ?? 0)}</div>
              <div className="stat-chip-label">This week</div>
            </div>
          </div>
          <div className="stat-chip">
            <TrendingUp size={16} color="var(--primary)" />
            <div>
              <div className="stat-chip-value">{isLoading ? '—' : formatVolume(stats?.totalVolumeKg ?? 0)}</div>
              <div className="stat-chip-label">kg lifted</div>
            </div>
          </div>
          <div className="stat-chip">
            <Clock size={16} color="var(--primary)" />
            <div>
              <div className="stat-chip-value">{isLoading ? '—' : (stats?.totalSets ?? 0)}</div>
              <div className="stat-chip-label">Total sets</div>
            </div>
          </div>
        </div>

        {/* Your Workouts */}
        <div className="section-header">
          <span className="section-title">Your Workouts</span>
          <a href="/workouts" className="section-link">See all</a>
        </div>

        {isLoading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
            Loading...
          </div>
        )}

        {!isLoading && workouts.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 20,
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏋️</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No workouts yet.</div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => navigate('/workouts/new')}
            >
              Create your first workout
            </button>
          </div>
        )}

        {workouts.map((w, i) => (
          <div className="workout-hero" key={w.id}>
            <div className="workout-hero-thumb">
              <span className="workout-hero-thumb-icon">🏋️</span>
            </div>
            <div className="workout-hero-body">
              <div className="workout-hero-name">{w.name}</div>
              <div className="workout-hero-tags">
                {w.description && (
                  <span className="pill pill-muted" style={{
                    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {w.description}
                  </span>
                )}
              </div>
              <button
                className="btn btn-primary"
                style={{ background: SESSION_COLORS[i % SESSION_COLORS.length], borderColor: SESSION_COLORS[i % SESSION_COLORS.length] }}
                onClick={() => navigate(`/workouts/${w.id}`)}
              >
                <Play size={16} />
                View workout
              </button>
            </div>
          </div>
        ))}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: 4 }}>
              <span className="section-title">Recent Sessions</span>
              <a href="/progress" className="section-link">History</a>
            </div>

            {sessions.map((s, i) => (
              <div key={s.id} className="session-row">
                <div className="session-dot" style={{ background: SESSION_COLORS[i % SESSION_COLORS.length] }} />
                <div className="session-info">
                  <div className="session-name">{s.workoutName}</div>
                  <div className="session-meta">{formatSessionDate(s.startedAt)}</div>
                </div>
                <div className="session-stats">
                  <div className="session-stats-val">{formatDuration(s.durationSeconds)}</div>
                  <div className="session-stats-sub">{s.completedAt ? 'Completed' : 'In progress'}</div>
                </div>
                <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
