import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { getMyStats, getMySessions } from '../../lib/api'
import type { UserStats, Session } from '../../lib/api'

const SESSION_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5AC8FA', '#BF5AF2']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

// Returns Mon=0 .. Sun=6 for a Date
function weekDayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

// Get the Monday of the current week
function getWeekStart(): Date {
  const now = new Date()
  const day = weekDayIndex(now)
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function buildWeekData(sessions: Session[]): { label: string; status: 'done' | 'today' | 'empty'; count: number }[] {
  const weekStart = getWeekStart()
  const today = weekDayIndex(new Date())

  return DAY_LABELS.map((label, i) => {
    const dayDate = new Date(weekStart)
    dayDate.setDate(weekStart.getDate() + i)

    const count = sessions.filter(s => {
      const d = new Date(s.startedAt)
      return d.toDateString() === dayDate.toDateString()
    }).length

    const status = i === today ? 'today' : count > 0 ? 'done' : 'empty'
    return { label, status, count }
  })
}

export function ProgressPage() {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([getMyStats(), getMySessions(1, 30)])
      .then(([s, sess]) => {
        setStats(s)
        setSessions(sess.data)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  const weekData = buildWeekData(sessions)
  const daysTrainedThisWeek = weekData.filter(d => d.status === 'done').length
  const maxCount = Math.max(...weekData.map(d => d.count), 1)
  const recentSessions = sessions.slice(0, 10)

  return (
    <div className="phone-shell">
      <header className="app-header">
        <span className="header-title">Progress</span>
      </header>

      <div className="content">
        {/* Top stats */}
        <div className="stats-row-3">
          <div className="mini-stat-card">
            <span className="mini-stat-val">{isLoading ? '—' : (stats?.totalSessions ?? 0)}</span>
            <span className="mini-stat-label">Sessions</span>
          </div>
          <div className="mini-stat-card">
            <span className="mini-stat-val">{isLoading ? '—' : formatVolume(stats?.totalVolumeKg ?? 0)}</span>
            <span className="mini-stat-label">kg Volume</span>
          </div>
          <div className="mini-stat-card">
            <span className="mini-stat-val" style={{ color: 'var(--primary)' }}>
              {isLoading ? '—' : `🔥${stats?.currentStreak ?? 0}`}
            </span>
            <span className="mini-stat-label">Streak</span>
          </div>
        </div>

        {/* This week */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ marginBottom: 16 }}>
            <span className="section-title">This Week</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              {daysTrainedThisWeek} / 7 days
            </span>
          </div>

          <div className="week-dots-row">
            {weekData.map((day) => (
              <div className="week-day" key={day.label}>
                <span className="week-day-label">{day.label}</span>
                <div className={`week-day-dot ${day.status}`}>
                  {day.status === 'done' && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions per day chart */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-header" style={{ marginBottom: 16 }}>
            <span className="section-title">This Week</span>
            <span className="pill pill-primary">Sessions / day</span>
          </div>

          <div className="bar-chart">
            {weekData.map((b, i) => {
              const isToday = b.status === 'today'
              const height = b.count > 0 ? Math.max((b.count / maxCount) * 100, 10) : 0
              return (
                <div className="bar-wrap" key={i}>
                  {height > 0 ? (
                    <div
                      className={`bar${isToday ? ' today-bar' : ''}`}
                      style={{ height: `${height}%` }}
                    />
                  ) : (
                    <div style={{ flex: 1 }} />
                  )}
                  <span className="bar-label">{b.label[0]}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="section-header">
          <span className="section-title">Recent Sessions</span>
        </div>

        {isLoading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
            Loading...
          </div>
        )}

        {!isLoading && recentSessions.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '24px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No sessions yet. Start training!</div>
          </div>
        )}

        {recentSessions.map((s, i) => (
          <div key={s.id} className="session-row">
            <div className="session-dot" style={{ background: SESSION_COLORS[i % SESSION_COLORS.length] }} />
            <div className="session-info">
              <div className="session-name">{s.workoutName}</div>
              <div className="session-meta">
                {formatSessionDate(s.startedAt)}
                {s.durationSeconds ? ` · ${formatDuration(s.durationSeconds)}` : ''}
              </div>
            </div>
            <div className="session-stats">
              <div className="session-stats-val">{s.completedAt ? 'Done' : 'In progress'}</div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
