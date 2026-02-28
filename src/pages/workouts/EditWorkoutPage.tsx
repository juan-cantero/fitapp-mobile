import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Search, Dumbbell, ChevronDown, ChevronUp, X } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import {
  getWorkout,
  updateWorkout,
  listExercises,
  type ExerciseBasic,
  type CreateWorkoutPayload,
} from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionType = 'warmup' | 'main' | 'cooldown'

interface SectionItemForm {
  id: string
  exerciseId: string
  exerciseName: string
  mediaUrl: string | null
  sets: number
  reps: number | null
  durationSeconds: number | null
  restSeconds: number
  useTime: boolean
  expanded: boolean
}

interface SectionForm {
  type: SectionType
  items: SectionItemForm[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<SectionType, string> = {
  warmup: 'var(--secondary)',
  main: 'var(--primary)',
  cooldown: 'var(--success)',
}

const SECTION_LABELS: Record<SectionType, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
}

const TAGS = ['Strength', 'Cardio', 'Mobility', 'Core', 'HIIT', 'Kettlebell', 'Barbell', 'Bodyweight']
const SECTION_ORDER: SectionType[] = ['warmup', 'main', 'cooldown']

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeItemFromExercise(exercise: ExerciseBasic): SectionItemForm {
  return {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    mediaUrl: exercise.mediaUrl,
    sets: 3,
    reps: 10,
    durationSeconds: null,
    restSeconds: 60,
    useTime: false,
    expanded: false,
  }
}

function formatItemMeta(item: SectionItemForm): string {
  const repsOrTime = item.useTime
    ? `${item.durationSeconds ?? '?'}s`
    : `${item.reps ?? '?'} reps`
  const rest = item.restSeconds > 0 ? ` · ${item.restSeconds}s rest` : ' · No rest'
  return `${item.sets}× ${repsOrTime}${rest}`
}

function buildPayload(
  name: string,
  description: string,
  tags: string[],
  visibility: 'private' | 'public',
  sections: SectionForm[],
): CreateWorkoutPayload {
  return {
    name: name.trim(),
    description: description.trim() || null,
    tags,
    visibility,
    estimatedMinutes: null,
    sections: sections
      .filter((s) => s.items.length > 0)
      .map((s, sIdx) => ({
        type: s.type,
        orderIndex: sIdx,
        items: s.items.map((item, iIdx) => ({
          exerciseId: item.exerciseId,
          orderIndex: iIdx,
          sets: item.sets,
          reps: item.useTime ? null : (item.reps ?? null),
          durationSeconds: item.useTime ? (item.durationSeconds ?? null) : null,
          weightKg: null,
          restSeconds: item.restSeconds,
          notes: null,
        })),
      })),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditWorkoutPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  // Load state
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [sections, setSections] = useState<SectionForm[]>(
    SECTION_ORDER.map((type) => ({ type, items: [] }))
  )

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Picker state
  const [pickerSection, setPickerSection] = useState<SectionType | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerResults, setPickerResults] = useState<ExerciseBasic[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load workout data into form
  useEffect(() => {
    if (!id) return
    setIsLoadingWorkout(true)
    setLoadError(null)
    getWorkout(id)
      .then((workout) => {
        setName(workout.name)
        setDescription(workout.description ?? '')
        setTags(workout.tags)
        setIsPublic(workout.visibility === 'public')
        setSections(
          SECTION_ORDER.map((type) => {
            const found = workout.sections.find((s) => s.type === type)
            if (!found) return { type, items: [] }
            return {
              type,
              items: [...found.items]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((item) => ({
                  id: crypto.randomUUID(),
                  exerciseId: item.exerciseId,
                  exerciseName: item.exerciseName,
                  mediaUrl: item.mediaUrl,
                  sets: item.sets,
                  reps: item.reps,
                  durationSeconds: item.durationSeconds,
                  restSeconds: item.restSeconds,
                  useTime: item.durationSeconds != null,
                  expanded: false,
                })),
            }
          })
        )
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load workout'))
      .finally(() => setIsLoadingWorkout(false))
  }, [id])

  // Load initial exercise list for picker
  useEffect(() => {
    listExercises(undefined, 1, 50)
      .then((res) => setPickerResults(res.data))
      .catch(() => {})
  }, [])

  // Debounced search
  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await listExercises(q.trim() || undefined, 1, 50)
        setPickerResults(res.data)
      } catch {
        // ignore
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    runSearch(pickerSearch)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [pickerSearch, runSearch])

  useEffect(() => {
    if (pickerSection) {
      setExpandedExerciseId(null)
      setTimeout(() => searchInputRef.current?.focus(), 360)
    }
  }, [pickerSection])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function openPicker(section: SectionType) {
    setPickerSearch('')
    setExpandedExerciseId(null)
    setPickerSection(section)
  }

  function closePicker() { setPickerSection(null) }

  function toggleExercisePreview(exerciseId: string) {
    setExpandedExerciseId((prev) => prev === exerciseId ? null : exerciseId)
  }

  function addExercise(exercise: ExerciseBasic) {
    if (!pickerSection) return
    setSections((prev) =>
      prev.map((s) =>
        s.type === pickerSection
          ? { ...s, items: [...s.items, makeItemFromExercise(exercise)] }
          : s
      )
    )
    setJustAdded((prev) => new Set(prev).add(exercise.id))
    setTimeout(() => {
      setJustAdded((prev) => { const next = new Set(prev); next.delete(exercise.id); return next })
    }, 900)
  }

  function removeItem(sectionType: SectionType, itemId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.type === sectionType ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s
      )
    )
  }

  function updateItem(sectionType: SectionType, itemId: string, patch: Partial<SectionItemForm>) {
    setSections((prev) =>
      prev.map((s) =>
        s.type === sectionType
          ? { ...s, items: s.items.map((i) => i.id === itemId ? { ...i, ...patch } : i) }
          : s
      )
    )
  }

  async function handleSave(visibility: 'private' | 'public') {
    if (!id) return
    setSaveError(null)
    setNameError(null)
    if (!name.trim()) { setNameError('Workout name is required'); return }

    const payload = buildPayload(name, description, tags, visibility, sections)
    setIsSaving(true)
    try {
      await updateWorkout(id, payload)
      navigate(`/workouts/${id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save workout')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────────

  if (isLoadingWorkout) {
    return (
      <div className="phone-shell">
        <header className="app-header">
          <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={18} />
            Edit Workout
          </button>
        </header>
        <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: 'var(--surface)', opacity: 0.7 }} />
          ))}
        </div>
        <BottomNav />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="phone-shell">
        <header className="app-header">
          <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={18} />
            Edit Workout
          </button>
        </header>
        <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Could not load workout</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{loadError}</div>
          <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
        <BottomNav />
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="phone-shell">
      <header className="app-header">
        <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={18} />
          Edit Workout
        </button>
      </header>

      <div className="content" style={{ paddingBottom: 160 }}>

        {/* Name */}
        <div className="form-field">
          <input
            type="text"
            className={`form-input-xl${nameError ? ' error' : ''}`}
            placeholder="Workout name…"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null) }}
          />
          {nameError && (
            <span style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'block' }}>
              {nameError}
            </span>
          )}
        </div>

        {/* Description */}
        <div className="form-field">
          <textarea
            className="form-textarea"
            placeholder="Description (optional)…"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Tags */}
        <div className="form-field">
          <span className="form-label">Tags</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-toggle-pill${tags.includes(tag) ? ' selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Visibility toggle */}
        <div className="card" style={{ marginBottom: 20, padding: '0 16px' }}>
          <div className="toggle-row">
            <div className="toggle-label-group">
              <div className="toggle-label">Public workout</div>
              <div className="toggle-hint">Anyone can discover and start this</div>
            </div>
            <button
              className={`toggle-switch${isPublic ? ' on' : ''}`}
              type="button"
              onClick={() => setIsPublic((v) => !v)}
              aria-label="Toggle public"
            />
          </div>
        </div>

        {/* Section blocks */}
        {sections.map((section) => {
          const color = SECTION_COLORS[section.type]
          const label = SECTION_LABELS[section.type]

          return (
            <div key={section.type} className="workout-section-block">
              <div className="workout-section-header">
                <span className="workout-section-title" style={{ color }}>{label}</span>
                <span
                  className="workout-section-count"
                  style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
                >
                  {section.items.length} {section.items.length === 1 ? 'exercise' : 'exercises'}
                </span>
              </div>

              {section.items.map((item) => (
                <div key={item.id}>
                  <div className="create-exercise-row">
                    <div className="create-exercise-thumb">
                      {item.mediaUrl ? (
                        <img
                          src={item.mediaUrl}
                          alt={item.exerciseName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
                        />
                      ) : (
                        <Dumbbell size={16} color="var(--text-muted)" />
                      )}
                    </div>

                    <div
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      onClick={() => updateItem(section.type, item.id, { expanded: !item.expanded })}
                    >
                      <div className="create-exercise-name">{item.exerciseName}</div>
                      <div className="create-exercise-meta">{formatItemMeta(item)}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => updateItem(section.type, item.id, { expanded: !item.expanded })}
                      style={{ color: 'var(--text-muted)', flexShrink: 0, padding: 4 }}
                    >
                      {item.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    <button
                      type="button"
                      className="create-exercise-delete"
                      onClick={() => removeItem(section.type, item.id)}
                      aria-label="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {item.expanded && (
                    <div className="create-exercise-config">
                      <div className="create-config-field">
                        <span className="create-config-label">Sets</span>
                        <input
                          type="number"
                          className="create-config-input"
                          value={item.sets}
                          min={1}
                          onChange={(e) =>
                            updateItem(section.type, item.id, { sets: Math.max(1, parseInt(e.target.value) || 1) })
                          }
                        />
                      </div>

                      <div className="create-config-field">
                        <button
                          type="button"
                          className="create-config-label-btn"
                          style={{ color }}
                          onClick={() => updateItem(section.type, item.id, { useTime: !item.useTime })}
                        >
                          {item.useTime ? 'Secs' : 'Reps'}
                        </button>
                        {item.useTime ? (
                          <input
                            type="number"
                            className="create-config-input"
                            value={item.durationSeconds ?? ''}
                            min={1}
                            placeholder="30"
                            onChange={(e) =>
                              updateItem(section.type, item.id, {
                                durationSeconds: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                          />
                        ) : (
                          <input
                            type="number"
                            className="create-config-input"
                            value={item.reps ?? ''}
                            min={1}
                            placeholder="10"
                            onChange={(e) =>
                              updateItem(section.type, item.id, {
                                reps: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                          />
                        )}
                      </div>

                      <div className="create-config-field">
                        <span className="create-config-label">Rest (s)</span>
                        <input
                          type="number"
                          className="create-config-input"
                          value={item.restSeconds}
                          min={0}
                          onChange={(e) =>
                            updateItem(section.type, item.id, {
                              restSeconds: Math.max(0, parseInt(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button type="button" className="add-exercise-btn" onClick={() => openPicker(section.type)}>
                <Plus size={14} strokeWidth={2.5} />
                Add exercise
              </button>
            </div>
          )
        })}

        {saveError && (
          <div style={{
            padding: '12px 14px',
            background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)', fontSize: 13, marginBottom: 12,
          }}>
            {saveError}
          </div>
        )}
      </div>

      {/* Fixed footer */}
      <div className="create-footer">
        <button
          type="button"
          className="btn-outline-muted"
          onClick={() => void handleSave('private')}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save as Private'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSave('public')}
          disabled={isSaving}
          style={{ flex: 1 }}
        >
          {isSaving ? 'Saving…' : 'Save & Publish'}
        </button>
      </div>

      {/* Picker overlay */}
      <div
        className={`bottom-sheet-overlay${pickerSection ? ' open' : ''}`}
        onClick={closePicker}
      />

      {/* Exercise picker sheet */}
      <div className={`bottom-sheet${pickerSection ? ' open' : ''}`}>
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="bottom-sheet-title">
              Add to {pickerSection ? SECTION_LABELS[pickerSection] : ''}
            </div>
            <button type="button" onClick={closePicker} style={{ color: 'var(--text-muted)', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
          <div className="search-wrap" style={{ marginBottom: 0 }}>
            <Search size={16} />
            <input
              ref={searchInputRef}
              type="search"
              className="search-input"
              placeholder="Search exercises…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="bottom-sheet-content">
          {isSearching && (
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Searching…
            </div>
          )}
          {!isSearching && pickerResults.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {pickerSearch ? 'No exercises found' : 'No exercises available'}
            </div>
          )}
          {pickerResults.map((exercise) => {
            const isExpanded = expandedExerciseId === exercise.id
            const isAdded = justAdded.has(exercise.id)
            return (
              <div key={exercise.id}>
                <div className="picker-exercise-row" onClick={() => toggleExercisePreview(exercise.id)}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, overflow: 'hidden',
                  }}>
                    {exercise.mediaUrl ? (
                      <img
                        src={exercise.mediaUrl}
                        alt={exercise.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Dumbbell size={16} color="var(--text-muted)" />
                    )}
                  </div>
                  <div className="picker-exercise-info">
                    <div className="picker-exercise-name">{exercise.name}</div>
                    {exercise.nameEn && (
                      <div className="picker-exercise-cat">{exercise.nameEn}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="picker-add-btn"
                    onClick={(e) => { e.stopPropagation(); addExercise(exercise) }}
                    aria-label={`Add ${exercise.name}`}
                    style={isAdded ? { background: 'var(--success)', color: '#fff' } : {}}
                  >
                    {isAdded ? '✓' : '+'}
                  </button>
                </div>
                {isExpanded && (
                  <div className="picker-exercise-detail">
                    {exercise.mediaUrl ? (
                      <img src={exercise.mediaUrl} alt={exercise.name} />
                    ) : (
                      <div className="picker-exercise-detail-placeholder">
                        <Dumbbell size={36} color="var(--text-muted)" />
                      </div>
                    )}
                    {exercise.primaryMuscle && (
                      <div className="picker-exercise-muscle">
                        Primary muscle: {exercise.primaryMuscle.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
