import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, Dumbbell, ChevronRight, Plus, AlertCircle, Lock, Globe } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { listWorkouts, listMyWorkouts, type Workout } from '../../lib/api'

type ViewMode = 'discover' | 'mine'
type SectionFilter = 'all' | 'warmup' | 'main' | 'cooldown'

const SECTION_FILTERS: { key: SectionFilter; label: string }[] = [
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

  const [viewMode, setViewMode] = useState<ViewMode>('discover')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')

  const fetchWorkouts = useCallback((mode: ViewMode) => {
    setIsLoading(true)
    setError(null)
    const fn = mode === 'mine' ? listMyWorkouts : listWorkouts
    fn()
      .then((res) => setWorkouts(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workouts'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    fetchWorkouts(viewMode)
  }, [viewMode, fetchWorkouts])

  function switchView(mode: ViewMode) {
    if (mode === viewMode) return
    setSearch('')
    setSectionFilter('all')
    setWorkouts([])
    setViewMode(mode)
  }

  const filtered = workouts.filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase())
    const matchesSection = sectionFilter === 'all' || getSectionType(w) === sectionFilter
    return matchesSearch && matchesSection
  })

  return (
    <div className="phone-shell">
      {/* Header */}
      <header className="app-header">
        <span className="header-title">Workouts</span>
        <button
          className="header-action-btn"
          aria-label="New workout"
          onClick={() => navigate('/workouts/new')}
        >
          <Plus size={16} />
          New
        </button>
      </header>

      <div className="content">

        {/* View mode toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          padding: 3,
          marginBottom: 14,
          gap: 3,
        }}>
          {(['discover', 'mine'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => switchView(mode)}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all var(--transition)',
                background: viewMode === mode ? 'var(--primary)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--text-muted)',
                fontFamily: 'inherit',
              }}
            >
              {mode === 'discover' ? 'Discover' : 'My Workouts'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="search-wrap">
          <Search size={16} />
          <input
            type="search"
            className="search-input"
            placeholder={viewMode === 'mine' ? 'Search my workouts…' : 'Search workouts…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Section filter pills */}
        <div className="tab-pills">
          {SECTION_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`tab-pill${sectionFilter === key ? ' active' : ''}`}
              onClick={() => setSectionFilter(key)}
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
              onClick={() => fetchWorkouts(viewMode)}
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
            <div style={{ fontSize: 48 }}>{viewMode === 'mine' ? '🏗️' : '💪'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {search
                ? 'No workouts found'
                : viewMode === 'mine'
                  ? 'No workouts yet'
                  : 'Nothing here'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {search
                ? 'Try a different search term.'
                : viewMode === 'mine'
                  ? 'Create your first workout and it will appear here.'
                  : 'No public workouts available.'}
            </div>
            {!search && viewMode === 'mine' && (
              <button
                className="btn btn-primary"
                style={{ width: 'auto', marginTop: 4 }}
                onClick={() => navigate('/workouts/new')}
              >
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
              const isPrivate = w.visibility === 'private'

              return (
                <div
                  key={w.id}
                  className="workout-list-card"
                  onClick={() => navigate(`/workouts/${w.id}`)}
                >
                  {w.coverImageUrl ? (
                    <div style={{
                      width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                      overflow: 'hidden', border: '1px solid var(--border)',
                    }}>
                      <img
                        src={w.coverImageUrl}
                        alt={w.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
                      />
                    </div>
                  ) : (
                    <div className="workout-list-accent" style={{ background: accent }} />
                  )}
                  <div className="workout-list-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div className="workout-list-name" style={{ margin: 0 }}>{w.name}</div>
                      {viewMode === 'mine' && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 10, fontWeight: 600,
                          padding: '2px 6px', borderRadius: 9999,
                          background: isPrivate
                            ? 'color-mix(in srgb, var(--text-muted) 12%, transparent)'
                            : 'color-mix(in srgb, var(--success) 15%, transparent)',
                          color: isPrivate ? 'var(--text-muted)' : 'var(--success)',
                          flexShrink: 0,
                        }}>
                          {isPrivate
                            ? <><Lock size={9} /> Private</>
                            : <><Globe size={9} /> Public</>}
                        </span>
                      )}
                    </div>
                    <div className="workout-list-tags">
                      {w.sections.map((s) => (
                        <span key={s.id} className="pill pill-muted" style={{ textTransform: 'capitalize' }}>
                          {s.type}
                        </span>
                      ))}
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
