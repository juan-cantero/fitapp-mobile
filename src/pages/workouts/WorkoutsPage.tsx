import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, Dumbbell, ChevronRight, Plus, AlertCircle } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { listWorkouts, type Workout } from '../../lib/api'

type TabFilter = 'all' | 'warmup' | 'main' | 'cooldown'

const TAB_LABELS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'warmup', label: 'Warmup' },
  { key: 'main', label: 'Main' },
  { key: 'cooldown', label: 'Cooldown' },
]

const ACCENT_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5E5CE6', '#FF2D55']

function getAccentColor(index: number): string {
  return ACCENT_COLORS[index % ACCENT_COLORS.length]
}

function getSectionType(workout: Workout): string {
  const types = workout.sections.map((s) => s.type)
  if (types.includes('main')) return 'main'
  if (types.includes('warmup')) return 'warmup'
  if (types.includes('cooldown')) return 'cooldown'
  return 'main'
}

function getTotalExercises(workout: Workout): number {
  return workout.sections.reduce((sum, s) => sum + s.items.length, 0)
}

function WorkoutSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            height: 88,
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  )
}

export function WorkoutsPage() {
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabFilter>('all')

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    listWorkouts()
      .then((res) => setWorkouts(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workouts'))
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = workouts.filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase())
    const matchesTab =
      activeTab === 'all' || getSectionType(w) === activeTab
    return matchesSearch && matchesTab
  })

  return (
    <div className="phone-shell">
      {/* Header */}
      <header className="app-header">
        <span className="header-title">Workouts</span>
        <button className="header-action-btn" aria-label="New workout">
          <Plus size={16} />
          New
        </button>
      </header>

      {/* Content */}
      <div className="content">
        {/* Search */}
        <div className="search-wrap">
          <Search size={16} />
          <input
            type="search"
            className="search-input"
            placeholder="Search workouts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tab pills */}
        <div className="tab-pills">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              className={`tab-pill${activeTab === key ? ' active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && <WorkoutSkeleton />}

        {/* Error */}
        {!isLoading && error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '40px 20px', textAlign: 'center',
          }}>
            <AlertCircle size={32} color="var(--danger)" />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', marginTop: 4 }}
              onClick={() => {
                setIsLoading(true)
                setError(null)
                listWorkouts()
                  .then((res) => setWorkouts(res.data))
                  .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load workouts'))
                  .finally(() => setIsLoading(false))
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filtered.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '60px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48 }}>💪</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {search ? 'No workouts found' : 'No workouts yet'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {search
                ? 'Try a different search term.'
                : 'Create your first workout to get started.'}
            </div>
            {!search && (
              <button className="btn btn-primary" style={{ width: 'auto', marginTop: 4 }}>
                <Plus size={16} />
                Create workout
              </button>
            )}
          </div>
        )}

        {/* Workout list */}
        {!isLoading && !error && filtered.length > 0 && (
          <div>
            {filtered.map((w, index) => {
              const totalExercises = getTotalExercises(w)
              const accent = getAccentColor(index)
              return (
                <div
                  key={w.id}
                  className="workout-list-card"
                  onClick={() => navigate(`/workouts/${w.id}`)}
                >
                  <div className="workout-list-accent" style={{ background: accent }} />
                  <div className="workout-list-body">
                    <div className="workout-list-name">{w.name}</div>
                    <div className="workout-list-tags">
                      {w.sections.map((s) => (
                        <span key={s.id} className="pill pill-muted" style={{ textTransform: 'capitalize' }}>
                          {s.type}
                        </span>
                      ))}
                      {w.visibility === 'public' && <span className="pill pill-success">Public</span>}
                    </div>
                    <div className="workout-list-stats">
                      <span className="workout-list-stat">
                        <Clock size={12} />
                        {w.estimatedMinutes != null ? `${w.estimatedMinutes} min` : '—'}
                      </span>
                      <span className="workout-list-stat">
                        <Dumbbell size={12} />
                        {totalExercises} exercises
                      </span>
                    </div>
                  </div>
                  <div className="workout-list-actions">
                    <ChevronRight size={18} color="var(--text-muted)" />
                    <button
                      className="btn"
                      style={{
                        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                        color: accent,
                        height: 32,
                        padding: '0 12px',
                        fontSize: 12,
                        borderRadius: 8,
                        border: 'none',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/workouts/${w.id}`)
                      }}
                    >
                      Start
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
