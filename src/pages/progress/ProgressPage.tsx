import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { getMyStats, getMySessions, getMyInsights } from '../../lib/api'
import type { UserStats, Session, SessionInsights } from '../../lib/api'

const SESSION_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5AC8FA', '#BF5AF2']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  adductors: 'Adductors',
  abductors: 'Abductors',
  traps: 'Traps',
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#FF6B35',
  back: '#5AC8FA',
  shoulders: '#FFB830',
  biceps: '#30D158',
  triceps: '#BF5AF2',
  quads: '#FF6B35',
  hamstrings: '#5AC8FA',
  glutes: '#FFB830',
  core: '#30D158',
  calves: '#BF5AF2',
  forearms: '#FF9500',
  traps: '#FF2D55',
  adductors: '#64D2FF',
  abductors: '#FFD60A',
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
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function weekDayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

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
  const navigate = useNavigate()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [insights, setInsights] = useState<SessionInsights | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([getMyStats(), getMySessions(1, 30), getMyInsights(30)])
      .then(([s, sess, ins]) => {
        setStats(s)
        setSessions(sess.data)
        setInsights(ins)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  const weekData = buildWeekData(sessions)
  const daysTrainedThisWeek = weekData.filter(d => d.status === 'done').length
  const recentSessions = sessions.slice(0, 10)

  const maxMuscleSets = Math.max(...(insights?.topMuscles.map(m => m.sets) ?? [1]), 1)

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

        {/* Top muscles — last 30 days */}
        {!isLoading && insights && insights.topMuscles.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <span className="section-title">Muscles Trained</span>
              <span className="pill pill-primary">Last 30 days</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.topMuscles.map((m) => {
                const pct = Math.round((m.sets / maxMuscleSets) * 100)
                const color = MUSCLE_COLORS[m.muscle] ?? 'var(--primary)'
                return (
                  <div key={m.muscle}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginBottom: 5, fontSize: 13,
                    }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {MUSCLE_LABELS[m.muscle] ?? m.muscle}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{m.sets} sets</span>
                    </div>
                    <div style={{
                      height: 6, borderRadius: 3,
                      background: 'var(--surface-2)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        borderRadius: 3, background: color,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Top exercises — last 30 days */}
        {!isLoading && insights && insights.topExercises.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header" style={{ marginBottom: 14 }}>
              <span className="section-title">Top Exercises</span>
              <span className="pill pill-primary">Last 30 days</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {insights.topExercises.map((ex, i) => (
                <div key={ex.exerciseId} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 0',
                  borderBottom: i < insights.topExercises.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: `color-mix(in srgb, var(--primary) 15%, transparent)`,
                    color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ex.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                      {ex.totalReps > 0 ? `${ex.totalReps} reps total` : `${ex.totalSets} sets`}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--text)',
                    background: 'var(--surface-2)', borderRadius: 8,
                    padding: '3px 9px', flexShrink: 0,
                  }}>
                    {ex.totalSets} sets
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
          <button
            key={s.id}
            className="session-row"
            onClick={() => navigate(`/sessions/${s.id}`)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
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
          </button>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
