import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Play, Dumbbell, RotateCcw, Pencil } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { getWorkout, type Workout, type WorkoutSection } from '../../lib/api'
import { getUser } from '../../lib/auth'

function getSectionColor(type: WorkoutSection['type']): string {
  switch (type) {
    case 'warmup':
      return 'var(--secondary)'
    case 'main':
      return 'var(--primary)'
    case 'cooldown':
      return 'var(--success)'
  }
}

function getSectionLabel(type: WorkoutSection['type']): string {
  switch (type) {
    case 'warmup':
      return 'Warmup'
    case 'main':
      return 'Main'
    case 'cooldown':
      return 'Cooldown'
  }
}

function formatRepsOrDuration(reps: number | null, durationSeconds: number | null): string {
  if (reps != null) return `${reps} reps`
  if (durationSeconds != null) {
    if (durationSeconds >= 60) {
      const m = Math.floor(durationSeconds / 60)
      const s = durationSeconds % 60
      return s > 0 ? `${m}m ${s}s` : `${m}m`
    }
    return `${durationSeconds}s`
  }
  return '—'
}

function DetailSkeleton() {
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 28, borderRadius: 8, background: 'var(--surface)', width: '60%' }} />
      <div style={{ height: 16, borderRadius: 8, background: 'var(--surface)', width: '80%' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ height: 24, borderRadius: 9999, background: 'var(--surface)', width: 80 }} />
        <div style={{ height: 24, borderRadius: 9999, background: 'var(--surface)', width: 60 }} />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--surface)', opacity: 0.7 }} />
      ))}
    </div>
  )
}

export function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    getWorkout(id)
      .then((data) => setWorkout(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workout'))
      .finally(() => setIsLoading(false))
  }, [id])

  const handleStart = () => {
    if (id) navigate(`/workouts/${id}/start`)
  }

  const currentUser = getUser()
  const canEdit = workout != null && (
    currentUser?.id === workout.createdBy || currentUser?.role === 'admin'
  )

  return (
    <div className="phone-shell">
      {/* Sticky top bar */}
      <header className="app-header">
        <button
          className="header-back-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        {!isLoading && workout && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canEdit && (
              <button
                className="header-action-btn"
                onClick={() => navigate(`/workouts/${id}/edit`)}
                aria-label="Edit workout"
                style={{ color: 'var(--text-muted)' }}
              >
                <Pencil size={14} />
                Edit
              </button>
            )}
            <button
              className="header-action-btn"
              onClick={handleStart}
              aria-label="Start workout"
            >
              <Play size={14} />
              Start
            </button>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="content" style={{ paddingBottom: 120 }}>
        {isLoading && <DetailSkeleton />}

        {!isLoading && error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '60px 20px', textAlign: 'center',
          }}>
            <Dumbbell size={36} color="var(--text-muted)" />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              Could not load workout
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', marginTop: 4 }}
              onClick={() => {
                if (!id) return
                setIsLoading(true)
                setError(null)
                getWorkout(id)
                  .then((data) => setWorkout(data))
                  .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load workout'))
                  .finally(() => setIsLoading(false))
              }}
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && workout && (
          <>
            {/* Workout title and meta */}
            <div style={{ marginBottom: 20 }}>
              <h1 style={{
                fontSize: 24, fontWeight: 800, color: 'var(--text)',
                letterSpacing: '-0.5px', marginBottom: 8, lineHeight: 1.2,
              }}>
                {workout.name}
              </h1>

              {workout.description && (
                <p style={{
                  fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12,
                }}>
                  {workout.description}
                </p>
              )}

              {/* Tags and duration */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {workout.tags.map((tag) => (
                  <span key={tag} className="pill pill-muted">{tag}</span>
                ))}
                {workout.estimatedMinutes != null && (
                  <span className="pill pill-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} />
                    {workout.estimatedMinutes} min
                  </span>
                )}
                {workout.visibility === 'public' && (
                  <span className="pill pill-success">Public</span>
                )}
              </div>
            </div>

            {/* Sections */}
            {workout.sections
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((section) => {
                const sectionColor = getSectionColor(section.type)
                const sectionLabel = getSectionLabel(section.type)
                const sortedItems = section.items
                  .slice()
                  .sort((a, b) => a.orderIndex - b.orderIndex)

                return (
                  <div key={section.id} style={{ marginBottom: 24 }}>
                    {/* Section header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                    }}>
                      <div style={{
                        height: 1, flex: 1, background: 'var(--border)',
                      }} />
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 9999,
                        background: `color-mix(in srgb, ${sectionColor} 15%, transparent)`,
                        color: sectionColor,
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', whiteSpace: 'nowrap',
                      }}>
                        {sectionLabel}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, borderRadius: '50%',
                          background: `color-mix(in srgb, ${sectionColor} 25%, transparent)`,
                          fontSize: 10, fontWeight: 800,
                        }}>
                          {sortedItems.length}
                        </span>
                      </span>
                      <div style={{
                        height: 1, flex: 1, background: 'var(--border)',
                      }} />
                    </div>

                    {/* Exercise rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sortedItems.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                            padding: '12px 14px',
                            background: 'var(--surface)', borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {/* Thumbnail */}
                          <div style={{
                            width: 48, height: 48, borderRadius: 10,
                            background: 'var(--surface-2)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                          }}>
                            {item.mediaUrl ? (
                              <img
                                src={item.mediaUrl}
                                alt={item.exerciseName}
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
                              marginBottom: 2, lineHeight: 1.3,
                            }}>
                              {item.exerciseName}
                            </div>

                            {item.exerciseNameEn && (
                              <div style={{
                                fontSize: 12, color: 'var(--text-muted)', marginBottom: 6,
                              }}>
                                {item.exerciseNameEn}
                              </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {/* Sets x reps/duration chip */}
                              <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '2px 8px', borderRadius: 6,
                                background: `color-mix(in srgb, ${sectionColor} 12%, transparent)`,
                                color: sectionColor,
                                fontSize: 12, fontWeight: 700,
                              }}>
                                {item.sets}x {formatRepsOrDuration(item.reps, item.durationSeconds)}
                              </span>

                              {/* Rest */}
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 12, color: 'var(--text-muted)',
                              }}>
                                <RotateCcw size={11} />
                                {item.restSeconds}s rest
                              </span>
                            </div>

                            {item.notes && (
                              <div style={{
                                fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic',
                                marginTop: 6, lineHeight: 1.4,
                              }}>
                                {item.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </>
        )}
      </div>

      {/* Sticky bottom Start button */}
      {!isLoading && !error && workout && (
        <div style={{
          position: 'fixed', bottom: 64, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430,
          padding: '12px 16px',
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          zIndex: 150,
        }}>
          <button
            className="btn btn-primary"
            onClick={handleStart}
          >
            <Play size={18} />
            Start Workout
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
