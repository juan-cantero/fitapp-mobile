import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Dumbbell, X, AlertCircle } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import {
  listExercises,
  getExercise,
  type ExerciseBasic,
  type ExerciseDetail,
  type MuscleGroup,
} from '../../lib/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MUSCLE_GROUPS: { key: MuscleGroup; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'forearms', label: 'Forearms' },
  { key: 'core', label: 'Core' },
  { key: 'quads', label: 'Quads' },
  { key: 'hamstrings', label: 'Hamstrings' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'calves', label: 'Calves' },
  { key: 'adductors', label: 'Adductors' },
  { key: 'abductors', label: 'Abductors' },
]

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#FF6B35',
  back: '#5E5CE6',
  shoulders: '#FFB830',
  biceps: '#30D158',
  triceps: '#30D158',
  forearms: '#30D158',
  core: '#FF9F0A',
  quads: '#64D2FF',
  hamstrings: '#64D2FF',
  glutes: '#64D2FF',
  calves: '#64D2FF',
  adductors: '#BF5AF2',
  abductors: '#BF5AF2',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLabel(snake: string): string {
  return snake.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getMuscleColor(muscle: string): string {
  return MUSCLE_COLORS[muscle] ?? 'var(--text-muted)'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ExerciseSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 72,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 160, borderRadius: 12, background: 'var(--surface-2)' }} />
      <div style={{ height: 24, borderRadius: 8, background: 'var(--surface)', width: '70%' }} />
      <div style={{ height: 16, borderRadius: 8, background: 'var(--surface)', width: '50%' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 28, width: 80, borderRadius: 9999, background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail sheet content
// ---------------------------------------------------------------------------

function ExerciseDetailContent({ detail }: { detail: ExerciseDetail }) {
  const color = getMuscleColor(detail.primaryMuscle)

  return (
    <div style={{ padding: '4px 16px 24px' }}>
      {/* Image */}
      <div style={{
        width: '100%', height: 180,
        background: 'var(--surface-2)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        {detail.mediaUrl ? (
          <img
            src={detail.mediaUrl}
            alt={detail.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Dumbbell size={48} color="var(--text-muted)" />
        )}
      </div>

      {/* Name */}
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px', marginBottom: 4 }}>
        {detail.name}
      </div>
      {detail.nameEn && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          {detail.nameEn}
        </div>
      )}

      {/* Badge row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{
          padding: '4px 10px', borderRadius: 9999,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          color, fontSize: 12, fontWeight: 700,
        }}>
          {toLabel(detail.primaryMuscle)}
        </span>
        <span style={{
          padding: '4px 10px', borderRadius: 9999,
          background: 'var(--surface-2)',
          color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
        }}>
          {toLabel(detail.difficulty)}
        </span>
        {detail.isCompound && (
          <span style={{
            padding: '4px 10px', borderRadius: 9999,
            background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
            color: 'var(--primary)', fontSize: 12, fontWeight: 600,
          }}>
            Compound
          </span>
        )}
        <span style={{
          padding: '4px 10px', borderRadius: 9999,
          background: 'var(--surface-2)',
          color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
        }}>
          {toLabel(detail.bodyPosition)}
        </span>
      </div>

      {/* Movement pattern */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
          Movement
        </div>
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
          {toLabel(detail.movementPattern)}
        </div>
      </div>

      {/* Secondary muscles */}
      {detail.secondaryMuscles.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Secondary muscles
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.secondaryMuscles.map((m) => (
              <span key={m} style={{
                padding: '3px 10px', borderRadius: 9999,
                background: `color-mix(in srgb, ${getMuscleColor(m)} 10%, transparent)`,
                color: getMuscleColor(m),
                fontSize: 12, fontWeight: 600,
              }}>
                {toLabel(m)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Equipment */}
      {detail.equipment.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Equipment
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.equipment.map((e) => (
              <span key={e} className="pill pill-muted">{toLabel(e)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      {detail.instructions && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Instructions
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {detail.instructions}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExercisesPage() {
  const [exercises, setExercises] = useState<ExerciseBasic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null)

  // Detail sheet state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ExerciseDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const searchRef = useRef(search)
  const muscleRef = useRef(muscleFilter)
  useEffect(() => { searchRef.current = search }, [search])
  useEffect(() => { muscleRef.current = muscleFilter }, [muscleFilter])

  const fetchExercises = useCallback((q: string, muscle: MuscleGroup | null) => {
    setIsLoading(true)
    setError(null)
    listExercises(q || undefined, 1, 50, muscle ?? undefined)
      .then((res) => setExercises(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load exercises'))
      .finally(() => setIsLoading(false))
  }, [])

  // Initial load
  useEffect(() => {
    fetchExercises('', null)
  }, [fetchExercises])

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchExercises(value, muscleRef.current)
    }, 300)
  }

  function handleMuscleFilter(muscle: MuscleGroup | null) {
    setMuscleFilter(muscle)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    fetchExercises(searchRef.current, muscle)
  }

  // Open detail sheet
  function openDetail(id: string) {
    setSelectedId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    getExercise(id)
      .then((d) => setDetail(d))
      .catch((err) => setDetailError(err instanceof Error ? err.message : 'Failed to load exercise'))
      .finally(() => setDetailLoading(false))
  }

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
  }

  return (
    <div className="phone-shell">
      <header className="app-header">
        <span className="header-title">Exercises</span>
      </header>

      <div className="content" style={{ paddingBottom: 80 }}>
        {/* Search */}
        <div className="search-wrap">
          <Search size={16} />
          <input
            type="search"
            className="search-input"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Muscle group filter chips */}
        <div className="tab-pills">
          <button
            className={`tab-pill${muscleFilter === null ? ' active' : ''}`}
            onClick={() => handleMuscleFilter(null)}
          >
            All
          </button>
          {MUSCLE_GROUPS.map(({ key, label }) => (
            <button
              key={key}
              className={`tab-pill${muscleFilter === key ? ' active' : ''}`}
              onClick={() => handleMuscleFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && <ExerciseSkeleton />}

        {/* Error */}
        {!isLoading && error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '40px 20px', textAlign: 'center',
          }}>
            <AlertCircle size={32} color="var(--danger)" />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Failed to load</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
            <button
              className="btn btn-outline"
              style={{ width: 'auto' }}
              onClick={() => fetchExercises(search, muscleFilter)}
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && exercises.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '60px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48 }}>🏋️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>No exercises found</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {search || muscleFilter ? 'Try adjusting your search or filter.' : 'No exercises in the library yet.'}
            </div>
          </div>
        )}

        {/* Exercise list */}
        {!isLoading && !error && exercises.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {exercises.map((ex) => {
              const color = getMuscleColor(ex.primaryMuscle)
              return (
                <div
                  key={ex.id}
                  onClick={() => openDetail(ex.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {ex.mediaUrl ? (
                      <img
                        src={ex.mediaUrl}
                        alt={ex.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Dumbbell size={20} color="var(--text-muted)" />
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: 'var(--text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {ex.name}
                    </div>
                    {ex.nameEn && (
                      <div style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {ex.nameEn}
                      </div>
                    )}
                    <span style={{
                      display: 'inline-block', marginTop: 4,
                      padding: '2px 8px', borderRadius: 9999,
                      background: `color-mix(in srgb, ${color} 12%, transparent)`,
                      color, fontSize: 11, fontWeight: 700,
                    }}>
                      {toLabel(ex.primaryMuscle)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail bottom sheet */}
      {selectedId && (
        <>
          <div className="bottom-sheet-overlay open" onClick={closeDetail} />
          <div className="bottom-sheet open" style={{ maxHeight: '85vh' }}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-header" style={{ paddingBottom: 0 }}>
              <button
                style={{
                  position: 'absolute', top: 16, right: 16,
                  background: 'var(--surface-2)', border: 'none',
                  borderRadius: '50%', width: 30, height: 30,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-muted)',
                }}
                onClick={closeDetail}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bottom-sheet-content">
              {detailLoading && <DetailSkeleton />}
              {!detailLoading && detailError && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {detailError}
                </div>
              )}
              {!detailLoading && detail && <ExerciseDetailContent detail={detail} />}
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  )
}
