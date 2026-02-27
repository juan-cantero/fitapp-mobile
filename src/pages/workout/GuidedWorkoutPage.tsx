import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import {
  getWorkout,
  startSession,
  logSet,
  finishSession,
  type Workout,
  type WorkoutSection,
} from '../../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlatExercise {
  sectionType: 'warmup' | 'main' | 'cooldown'
  exerciseId: string
  exerciseName: string
  exerciseNameEn: string | null
  mediaUrl: string | null
  sets: number
  reps: number | null
  durationSeconds: number | null
  restSeconds: number
  notes: string | null
}

type Phase = 'loading' | 'getready' | 'exercise' | 'rest' | 'done'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFlatExercises(workout: Workout): FlatExercise[] {
  const sortedSections = workout.sections.slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const flat: FlatExercise[] = []

  for (const section of sortedSections) {
    const sortedItems = section.items.slice().sort((a, b) => a.orderIndex - b.orderIndex)
    for (const item of sortedItems) {
      flat.push({
        sectionType: section.type,
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        exerciseNameEn: item.exerciseNameEn,
        mediaUrl: item.mediaUrl,
        sets: item.sets,
        reps: item.reps,
        durationSeconds: item.durationSeconds,
        restSeconds: item.restSeconds,
        notes: item.notes,
      })
    }
  }

  return flat
}

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

// SVG ring circumference for r=80
const CIRCUMFERENCE = 2 * Math.PI * 80

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GuidedWorkoutPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [flatExercises, setFlatExercises] = useState<FlatExercise[]>([])
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [currentSet, setCurrentSet] = useState(1)
  const [phase, setPhase] = useState<Phase>('loading')
  const [restSecondsLeft, setRestSecondsLeft] = useState(0)
  const [totalRestSeconds, setTotalRestSeconds] = useState(0)
  const [exerciseSecondsLeft, setExerciseSecondsLeft] = useState(0)
  const [totalExerciseSeconds, setTotalExerciseSeconds] = useState(0)
  const [getReadyCount, setGetReadyCount] = useState(3)
  const [weightInput, setWeightInput] = useState('')
  const [setsLogged, setSetsLogged] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // Refs to always have latest values inside callbacks/effects without stale closures
  const exerciseIndexRef = useRef(exerciseIndex)
  const currentSetRef = useRef(currentSet)
  const flatExercisesRef = useRef(flatExercises)
  const sessionIdRef = useRef(sessionId)
  const phaseRef = useRef(phase)

  useEffect(() => { exerciseIndexRef.current = exerciseIndex }, [exerciseIndex])
  useEffect(() => { currentSetRef.current = currentSet }, [currentSet])
  useEffect(() => { flatExercisesRef.current = flatExercises }, [flatExercises])
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // -------------------------------------------------------------------------
  // Mount: load workout and start session
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return
    Promise.all([getWorkout(id), startSession(id)])
      .then(([w, session]) => {
        setWorkout(w)
        setSessionId(session.id)
        const flat = buildFlatExercises(w)
        setFlatExercises(flat)
        flatExercisesRef.current = flat
        if (flat.length === 0) {
          setPhase('done')
        } else {
          setPhase('getready')
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start workout')
      })
  }, [id])

  // -------------------------------------------------------------------------
  // Finish session
  // -------------------------------------------------------------------------

  const handleFinish = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) {
      setPhase('done')
      return
    }
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
    try {
      await finishSession(sid, durationSeconds)
    } catch {
      // Session already finished or network error — still go to done
    }
    setPhase('done')
  }, [startedAt])

  // -------------------------------------------------------------------------
  // Advance after rest
  // -------------------------------------------------------------------------

  const advanceAfterRest = useCallback(() => {
    const idx = exerciseIndexRef.current
    const set = currentSetRef.current
    const flat = flatExercisesRef.current
    const ex = flat[idx]

    if (!ex) {
      handleFinish()
      return
    }

    if (set < ex.sets) {
      setCurrentSet((s) => s + 1)
      setGetReadyCount(3)
      setPhase('getready')
    } else if (idx < flat.length - 1) {
      setExerciseIndex((i) => i + 1)
      setCurrentSet(1)
      setWeightInput('')
      setGetReadyCount(3)
      setPhase('getready')
    } else {
      handleFinish()
    }
  }, [handleFinish])

  // -------------------------------------------------------------------------
  // Rest timer — ticks every second, triggers advanceAfterRest when done
  // -------------------------------------------------------------------------

  // We use a separate effect to trigger advance when timer hits 0, so the
  // timer effect itself only manages the countdown with a simple callback form.
  const advanceAfterRestRef = useRef(advanceAfterRest)
  useEffect(() => { advanceAfterRestRef.current = advanceAfterRest }, [advanceAfterRest])

  useEffect(() => {
    if (phase !== 'rest') return

    const interval = setInterval(() => {
      setRestSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval)
          // Defer so state update completes before triggering advance
          setTimeout(() => advanceAfterRestRef.current(), 0)
          return 0
        }
        return s - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [phase])

  // -------------------------------------------------------------------------
  // Get Ready countdown (3-2-1 before each exercise)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (phase !== 'getready') return
    setGetReadyCount(3)

    const interval = setInterval(() => {
      setGetReadyCount((n) => {
        if (n <= 1) {
          clearInterval(interval)
          setTimeout(() => setPhase('exercise'), 0)
          return 0
        }
        return n - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [phase])

  // -------------------------------------------------------------------------
  // Exercise timer (for duration-based exercises)
  // Starts when phase === 'exercise' and current exercise has durationSeconds
  // -------------------------------------------------------------------------

  const handleCompleteSetRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (phase !== 'exercise') return
    const currentEx = flatExercisesRef.current[exerciseIndexRef.current]
    if (!currentEx?.durationSeconds) return

    // Start the exercise countdown
    const dur = currentEx.durationSeconds
    setExerciseSecondsLeft(dur)
    setTotalExerciseSeconds(dur)

    const interval = setInterval(() => {
      setExerciseSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval)
          setTimeout(() => handleCompleteSetRef.current(), 0)
          return 0
        }
        return s - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [phase, exerciseIndex])

  // -------------------------------------------------------------------------
  // Complete set
  // -------------------------------------------------------------------------

  // Keep ref in sync so the exercise timer can call it without stale closure
  const handleCompleteSet = async function handleCompleteSet() {
    const sid = sessionIdRef.current
    const flat = flatExercisesRef.current
    const idx = exerciseIndexRef.current
    const set = currentSetRef.current
    const ex = flat[idx]

    if (!ex) return

    const weight = parseFloat(weightInput) || null

    if (sid) {
      try {
        await logSet(sid, {
          exerciseId: ex.exerciseId,
          setNumber: set,
          repsDone: ex.reps,
          weightKg: weight,
        })
        setSetsLogged((n) => n + 1)
      } catch {
        // Log silently — don't block the user
        setSetsLogged((n) => n + 1)
      }
    }

    const hasMoreSets = set < ex.sets
    const hasMoreExercises = idx < flat.length - 1

    if (hasMoreSets || hasMoreExercises) {
      const rest = ex.restSeconds
      setRestSecondsLeft(rest)
      setTotalRestSeconds(rest)
      setPhase('rest')
    } else {
      handleFinish()
    }
  }
  handleCompleteSetRef.current = handleCompleteSet

  // -------------------------------------------------------------------------
  // Exit confirmation
  // -------------------------------------------------------------------------

  function handleExit() {
    if (window.confirm('Exit workout? Your progress has been saved up to this point.')) {
      navigate('/home')
    }
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const totalSets = flatExercises.reduce((sum, ex) => sum + ex.sets, 0)
  const progressPct = totalSets > 0 ? Math.round((setsLogged / totalSets) * 100) : 0

  const ex = flatExercises[exerciseIndex]
  const sectionColor = ex ? getSectionColor(ex.sectionType) : 'var(--primary)'
  const sectionLabel = ex ? getSectionLabel(ex.sectionType) : ''

  // Rest ring
  const elapsed = totalRestSeconds - restSecondsLeft
  const fraction = totalRestSeconds > 0 ? elapsed / totalRestSeconds : 0
  const strokeDashoffset = CIRCUMFERENCE * (1 - fraction)

  // Next exercise preview during rest
  const nextExInRest =
    ex && currentSet < ex.sets
      ? ex
      : flatExercises[exerciseIndex + 1] ?? ex

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="guided-shell">
      {/* Top bar */}
      <div className="guided-topbar">
        <div style={{ minWidth: 64 }} />
        <div className="guided-workout-name">{workout?.name ?? 'Workout'}</div>
        <button className="guided-exit-btn" onClick={handleExit}>Exit</button>
      </div>

      {/* Progress bar */}
      <div className="guided-progress-bar">
        <div className="guided-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Phase: loading                                                       */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'loading' && !error && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 14 }}>Starting workout...</div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error state                                                          */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, padding: '0 24px', textAlign: 'center',
        }}>
          <AlertCircle size={32} color="var(--danger)" />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Failed to start</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
          <button
            className="btn btn-outline"
            style={{ width: 'auto' }}
            onClick={() => navigate(`/workouts/${id}`)}
          >
            Go back
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: get ready                                                     */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'getready' && flatExercises[exerciseIndex] && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '32px 24px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Get Ready
          </div>
          <div style={{
            fontSize: 96, fontWeight: 800, color: 'var(--primary)',
            lineHeight: 1, letterSpacing: '-4px',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {getReadyCount}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)',
            textAlign: 'center', letterSpacing: '-0.3px' }}>
            {flatExercises[exerciseIndex].exerciseName}
          </div>
          {flatExercises[exerciseIndex].exerciseNameEn && (
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {flatExercises[exerciseIndex].exerciseNameEn}
            </div>
          )}
          <button
            className="btn btn-ghost"
            style={{ marginTop: 8 }}
            onClick={() => setPhase('exercise')}
          >
            Skip
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: exercise                                                      */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'exercise' && ex && (
        <>
          <div className="guided-content">
            {/* Section badge */}
            <div>
              <span
                className="section-badge"
                style={{
                  background: `color-mix(in srgb, ${sectionColor} 15%, transparent)`,
                  color: sectionColor,
                }}
              >
                {sectionLabel}
              </span>
            </div>

            {/* Exercise image / placeholder */}
            <div className="exercise-gif-placeholder">
              {ex.mediaUrl ? (
                <img
                  src={ex.mediaUrl}
                  alt={ex.exerciseName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }}
                />
              ) : (
                <span style={{ fontSize: 72 }}>🏋️</span>
              )}
            </div>

            {/* Name */}
            <div>
              <div className="guided-exercise-name">{ex.exerciseName}</div>
              {ex.exerciseNameEn && (
                <div className="guided-exercise-alt">{ex.exerciseNameEn}</div>
              )}
            </div>

            {/* Set info row */}
            <div className="set-info-row">
              <div className="set-info-item">
                <span className="set-info-val">Set {currentSet}</span>
                <span className="set-info-label">of {ex.sets}</span>
              </div>
              <div className="set-info-item">
                <span className="set-info-val">
                  {ex.reps ?? (ex.durationSeconds ? `${ex.durationSeconds}s` : '—')}
                </span>
                <span className="set-info-label">{ex.reps ? 'reps' : 'duration'}</span>
              </div>
              <div className="set-info-item">
                <span className="set-info-val">{ex.restSeconds}s</span>
                <span className="set-info-label">rest</span>
              </div>
            </div>

            {ex.durationSeconds ? (
              /* ---- Timer-based exercise ---- */
              <>
                <div className="rest-ring-container" style={{ margin: '0 auto' }}>
                  <svg className="rest-ring-svg" viewBox="0 0 180 180">
                    <circle className="rest-ring-bg" cx="90" cy="90" r="80" />
                    <circle
                      className="rest-ring-fill"
                      cx="90" cy="90" r="80"
                      style={{
                        stroke: 'var(--success)',
                        strokeDashoffset: CIRCUMFERENCE * (1 - (totalExerciseSeconds > 0
                          ? (totalExerciseSeconds - exerciseSecondsLeft) / totalExerciseSeconds
                          : 0)),
                      }}
                    />
                  </svg>
                  <div style={{ textAlign: 'center' }}>
                    <div className="rest-countdown" style={{ color: 'var(--success)' }}>
                      {exerciseSecondsLeft}
                    </div>
                    <div className="rest-label">HOLD</div>
                  </div>
                </div>

                {ex.notes && <div className="exercise-note">{ex.notes}</div>}
              </>
            ) : (
              /* ---- Reps-based exercise ---- */
              <>
                <div className="weight-input-row">
                  <span className="weight-input-label">Weight used</span>
                  <input
                    type="number"
                    className="weight-input"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="0"
                  />
                  <span className="weight-unit">kg</span>
                </div>

                {ex.notes && <div className="exercise-note">{ex.notes}</div>}

                <button
                  className="btn btn-success-lg"
                  onClick={handleCompleteSet}
                  style={{ marginTop: 4 }}
                >
                  Complete Set ✓
                </button>
              </>
            )}
          </div>

          {/* Ghost actions */}
          <div className="guided-actions" style={{ paddingBottom: 20 }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setWeightInput('')
                handleCompleteSet()
              }}
            >
              Skip
            </button>
            <button className="btn btn-ghost" onClick={handleExit}>Exit</button>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: rest                                                          */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'rest' && (
        <div className="rest-screen">
          {/* SVG ring */}
          <div className="rest-ring-container">
            <svg className="rest-ring-svg" viewBox="0 0 180 180">
              <circle className="rest-ring-bg" cx="90" cy="90" r="80" />
              <circle
                className="rest-ring-fill"
                cx="90"
                cy="90"
                r="80"
                style={{ strokeDashoffset }}
              />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div className="rest-countdown">{restSecondsLeft}</div>
              <div className="rest-label">REST</div>
            </div>
          </div>

          {/* Next exercise preview */}
          <div className="next-preview-card">
            <div className="next-preview-thumb">
              {nextExInRest?.mediaUrl ? (
                <img
                  src={nextExInRest.mediaUrl}
                  alt={nextExInRest.exerciseName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
                />
              ) : (
                <span>💪</span>
              )}
            </div>
            <div>
              <div className="next-preview-label">
                {ex && currentSet < ex.sets ? 'Next set' : 'Next exercise'}
              </div>
              <div className="next-preview-name">
                {ex && currentSet < ex.sets
                  ? ex.exerciseName
                  : (flatExercises[exerciseIndex + 1]?.exerciseName ?? 'Last exercise')}
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="rest-btn-row">
            <button
              className="btn btn-outline"
              style={{ flex: 1 }}
              onClick={() => {
                setRestSecondsLeft(0)
                advanceAfterRest()
              }}
            >
              Skip Rest
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setRestSecondsLeft((s) => s + 30)
                setTotalRestSeconds((t) => t + 30)
              }}
            >
              + 30s
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: done                                                          */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'done' && (
        <div className="completion-screen">
          <div className="completion-check">✓</div>
          <div className="completion-title">Workout Complete!</div>
          <div style={{
            fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', marginTop: -8,
          }}>
            Great work! Keep the streak going.
          </div>

          <div className="completion-stats-grid">
            <div className="completion-stat">
              <span className="completion-stat-val">
                {Math.round((Date.now() - startedAt) / 60000)}
              </span>
              <span className="completion-stat-label">Total min</span>
            </div>
            <div className="completion-stat">
              <span className="completion-stat-val">{setsLogged}</span>
              <span className="completion-stat-label">Sets done</span>
            </div>
            <div className="completion-stat">
              <span className="completion-stat-val">{flatExercises.length}</span>
              <span className="completion-stat-label">Exercises</span>
            </div>
            <div className="completion-stat">
              <span className="completion-stat-val">
                {workout?.name?.split(' ')[0] ?? '—'}
              </span>
              <span className="completion-stat-label">Workout</span>
            </div>
          </div>

          <div className="completion-actions">
            <button className="btn btn-primary" onClick={() => navigate('/home')}>
              Save &amp; Close
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/progress')}>
              View Progress
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
