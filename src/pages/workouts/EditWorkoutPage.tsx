import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Search, Dumbbell, ChevronDown, ChevronUp, X, Image } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import {
  getWorkout,
  updateWorkout,
  uploadWorkoutCover,
  listCircuitPresets,
  createCircuitPreset,
  type ExerciseBasic,
  type CreateWorkoutPayload,
  type CircuitPreset,
  MUSCLE_GROUP_LABELS,
  EQUIPMENT_LABELS,
} from '../../lib/api'
import { useInfiniteExercises } from '../../hooks/useInfiniteExercises'

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
  circuitGroup: number | null
  circuitRounds: number | null
  circuitRestSeconds: number | null
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

const CIRCUIT_COLORS = ['#FF6B35', '#5AC8FA', '#BF5AF2', '#FFB830', '#30D158']
const CIRCUIT_LETTERS = ['A', 'B', 'C', 'D', 'E']

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
    circuitGroup: null,
    circuitRounds: null,
    circuitRestSeconds: null,
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
          circuitGroup: item.circuitGroup ?? null,
          circuitRounds: item.circuitRounds ?? null,
          circuitRestSeconds: item.circuitRestSeconds ?? null,
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

  // Cover image state
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Exercise picker state
  const [pickerSection, setPickerSection] = useState<SectionType | null>(null)
  const [pickerSearchInput, setPickerSearchInput] = useState('')
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerEquipment, setPickerEquipment] = useState<string>('')
  const [pickerMuscle, setPickerMuscle] = useState<string>('')
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [openFilter, setOpenFilter] = useState<'equipment' | 'muscle' | null>(null)

  const pickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pickerScrollRef = useRef<HTMLDivElement>(null)

  const pickerSortBy: 'name' | 'mostUsed' = !pickerSearch && !pickerEquipment && !pickerMuscle ? 'mostUsed' : 'name'

  // Preset state
  const [presets, setPresets] = useState<CircuitPreset[]>([])
  const [presetsLoaded, setPresetsLoaded] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState<SectionType | null>(null)
  const [savingPresetForCircuit, setSavingPresetForCircuit] = useState<{ sectionType: SectionType; circuitGroup: number } | null>(null)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [isSavingPreset, setIsSavingPreset] = useState(false)

  const {
    exercises: pickerResults,
    isLoading: isSearching,
    isFetchingMore: isPickerFetchingMore,
    sentinelRef: pickerSentinelRef,
  } = useInfiniteExercises(pickerSearch, pickerMuscle as any || null, undefined, pickerScrollRef, pickerEquipment || undefined, pickerSortBy)

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
        setCoverImageUrl(workout.coverImageUrl)
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
                  circuitGroup: item.circuitGroup ?? null,
                  circuitRounds: item.circuitRounds ?? null,
                  circuitRestSeconds: item.circuitRestSeconds ?? null,
                })),
            }
          })
        )
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load workout'))
      .finally(() => setIsLoadingWorkout(false))
  }, [id])

  function handlePickerSearchChange(value: string) {
    setPickerSearchInput(value)
    if (pickerDebounceRef.current) clearTimeout(pickerDebounceRef.current)
    pickerDebounceRef.current = setTimeout(() => setPickerSearch(value), 300)
  }

  useEffect(() => {
    if (pickerSection) {
      setExpandedExerciseId(null)
      setTimeout(() => searchInputRef.current?.focus(), 360)
    }
  }, [pickerSection])

  // ── Preset handlers ──────────────────────────────────────────────────────────

  async function loadPresets() {
    if (presetsLoaded) return
    try {
      const data = await listCircuitPresets()
      setPresets(data)
      setPresetsLoaded(true)
    } catch { /* ignore */ }
  }

  async function handleSavePreset() {
    if (!savingPresetForCircuit || !presetNameInput.trim()) return
    const { sectionType, circuitGroup } = savingPresetForCircuit
    const section = sections.find(s => s.type === sectionType)!
    const circuitItems = section.items.filter(i => i.circuitGroup === circuitGroup)
    const firstItem = circuitItems[0]

    setIsSavingPreset(true)
    try {
      const preset = await createCircuitPreset({
        name: presetNameInput.trim(),
        rounds: firstItem?.circuitRounds ?? null,
        circuitRestSeconds: firstItem?.circuitRestSeconds ?? null,
        items: circuitItems.map((item, i) => ({
          exerciseId: item.exerciseId,
          exerciseName: item.exerciseName,
          mediaUrl: item.mediaUrl,
          orderIndex: i,
          sets: item.sets,
          reps: item.useTime ? null : item.reps,
          durationSeconds: item.useTime ? item.durationSeconds : null,
          weightKg: null,
          restSeconds: item.restSeconds,
          notes: null,
        })),
      })
      setPresets(prev => [...prev, preset])
      setSavingPresetForCircuit(null)
      setPresetNameInput('')
    } catch { /* ignore */ } finally {
      setIsSavingPreset(false)
    }
  }

  function insertPreset(sectionType: SectionType, preset: CircuitPreset) {
    setSections(prev => prev.map(s => {
      if (s.type !== sectionType) return s
      const existingGroups = s.items.map(i => i.circuitGroup).filter((g): g is number => g != null)
      const nextGroup = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1
      const newItems: SectionItemForm[] = preset.items.map((item) => ({
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
        circuitGroup: nextGroup,
        circuitRounds: preset.rounds,
        circuitRestSeconds: preset.circuitRestSeconds,
      }))
      return { ...s, items: [...s.items, ...newItems] }
    }))
    setShowPresetPicker(null)
  }

  // ── Exercise handlers ────────────────────────────────────────────────────────

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function openPicker(section: SectionType) {
    setPickerSearchInput('')
    setPickerSearch('')
    setExpandedExerciseId(null)
    setPickerSection(section)
  }

  function closePicker() { setPickerSection(null); setOpenFilter(null) }

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

  function updateCircuitRounds(sectionType: SectionType, circuitGroup: number, rounds: number) {
    setSections((prev) =>
      prev.map((s) =>
        s.type === sectionType
          ? {
              ...s,
              items: s.items.map((item) =>
                item.circuitGroup === circuitGroup
                  ? { ...item, circuitRounds: Math.max(1, rounds) }
                  : item
              ),
            }
          : s
      )
    )
  }

  function updateCircuitRestSeconds(sectionType: SectionType, circuitGroup: number, seconds: number) {
    setSections((prev) =>
      prev.map((s) =>
        s.type === sectionType
          ? {
              ...s,
              items: s.items.map((item) =>
                item.circuitGroup === circuitGroup
                  ? { ...item, circuitRestSeconds: Math.max(0, seconds) }
                  : item
              ),
            }
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

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setIsUploadingCover(true)
    setCoverUploadError(null)
    try {
      const updated = await uploadWorkoutCover(id, file)
      setCoverImageUrl(updated.coverImageUrl)
    } catch (err) {
      setCoverUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploadingCover(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
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

        {/* Cover image */}
        <div className="form-field">
          <span className="form-label">Cover image</span>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => void handleCoverUpload(e)}
          />
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={isUploadingCover}
            style={{
              width: '100%',
              height: 160,
              borderRadius: 12,
              border: coverImageUrl ? 'none' : '1.5px dashed var(--border)',
              background: coverImageUrl ? 'transparent' : 'var(--surface-2)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              padding: 0,
            }}
          >
            {coverImageUrl ? (
              <>
                <img
                  src={coverImageUrl}
                  alt="Cover"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, color: 'white', fontSize: 13, fontWeight: 600,
                }}>
                  <Image size={15} strokeWidth={2} />
                  {isUploadingCover ? 'Uploading…' : 'Change cover'}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                <Image size={28} strokeWidth={1.5} />
                <span style={{ fontSize: 13 }}>{isUploadingCover ? 'Uploading…' : 'Add cover image'}</span>
              </div>
            )}
          </button>
          {coverUploadError && (
            <span style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'block' }}>
              {coverUploadError}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            JPEG, PNG or WEBP · max 10 MB
          </span>
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

              {(() => {
                const existingCircuits = [...new Set(
                  section.items.map(i => i.circuitGroup).filter((g): g is number => g != null)
                )].sort((a, b) => a - b)
                const maxCircuit = existingCircuits.length > 0 ? Math.max(...existingCircuits) : 0

                return section.items.map((item, idx) => {
                  const prevItem = section.items[idx - 1]
                  const isInCircuit = item.circuitGroup != null
                  const isFirstInCircuit = isInCircuit && prevItem?.circuitGroup !== item.circuitGroup
                  const circuitColor = isInCircuit
                    ? CIRCUIT_COLORS[(item.circuitGroup! - 1) % CIRCUIT_COLORS.length]
                    : null
                  const circuitLetter = isInCircuit
                    ? CIRCUIT_LETTERS[(item.circuitGroup! - 1) % CIRCUIT_LETTERS.length]
                    : null

                  return (
                    <div
                      key={item.id}
                      style={isInCircuit ? { borderLeft: `3px solid ${circuitColor}` } : undefined}
                    >
                      {isFirstInCircuit && (
                        <div style={{
                          padding: '5px 10px',
                          fontSize: 11, fontWeight: 700, color: circuitColor!,
                          background: `color-mix(in srgb, ${circuitColor} 8%, transparent)`,
                          display: 'flex', alignItems: 'center', gap: 5,
                          flexWrap: 'wrap',
                        }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: '50%',
                            background: circuitColor!, color: '#fff',
                            fontSize: 9, fontWeight: 800,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>{circuitLetter}</span>
                          Circuit {circuitLetter}
                          {/* Rounds stepper */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const current = section.items.find((i) => i.circuitGroup === item.circuitGroup)?.circuitRounds ?? 1
                                if (current > 1) updateCircuitRounds(section.type, item.circuitGroup!, current - 1)
                              }}
                              style={{
                                width: 22, height: 22, borderRadius: '50%', border: `1px solid ${circuitColor}`,
                                background: 'transparent', color: circuitColor!, fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              }}
                            >−</button>
                            <span style={{ fontSize: 12, color: circuitColor!, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>
                              {section.items.find((i) => i.circuitGroup === item.circuitGroup)?.circuitRounds ?? 1}×
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const current = section.items.find((i) => i.circuitGroup === item.circuitGroup)?.circuitRounds ?? 1
                                updateCircuitRounds(section.type, item.circuitGroup!, current + 1)
                              }}
                              style={{
                                width: 22, height: 22, borderRadius: '50%', border: `1px solid ${circuitColor}`,
                                background: 'transparent', color: circuitColor!, fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              }}
                            >+</button>
                          </div>
                          {/* Circuit rest stepper */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                            <span style={{ fontSize: 10, color: circuitColor!, opacity: 0.8, marginRight: 2 }}>rest</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const current = section.items.find((i) => i.circuitGroup === item.circuitGroup)?.circuitRestSeconds ?? 60
                                if (current > 0) updateCircuitRestSeconds(section.type, item.circuitGroup!, current - 15)
                              }}
                              style={{
                                width: 22, height: 22, borderRadius: '50%', border: `1px solid ${circuitColor}`,
                                background: 'transparent', color: circuitColor!, fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              }}
                            >−</button>
                            <span style={{ fontSize: 12, color: circuitColor!, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>
                              {section.items.find((i) => i.circuitGroup === item.circuitGroup)?.circuitRestSeconds ?? 60}s
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const current = section.items.find((i) => i.circuitGroup === item.circuitGroup)?.circuitRestSeconds ?? 60
                                updateCircuitRestSeconds(section.type, item.circuitGroup!, current + 15)
                              }}
                              style={{
                                width: 22, height: 22, borderRadius: '50%', border: `1px solid ${circuitColor}`,
                                background: 'transparent', color: circuitColor!, fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              }}
                            >+</button>
                          </div>
                          {/* Save as preset */}
                          {savingPresetForCircuit?.circuitGroup === item.circuitGroup && savingPresetForCircuit?.sectionType === section.type ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 0 100%', paddingTop: 4 }}>
                              <input
                                type="text"
                                placeholder="Preset name…"
                                value={presetNameInput}
                                onChange={e => setPresetNameInput(e.target.value)}
                                style={{
                                  flex: 1, padding: '4px 8px', borderRadius: 6, fontSize: 12,
                                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                                  color: 'var(--text)',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => void handleSavePreset()}
                                disabled={isSavingPreset || !presetNameInput.trim()}
                                style={{
                                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  background: circuitColor!, color: '#fff', border: 'none', cursor: 'pointer',
                                }}
                              >
                                {isSavingPreset ? '…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSavingPresetForCircuit(null); setPresetNameInput('') }}
                                style={{ fontSize: 14, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                              >✕</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSavingPresetForCircuit({ sectionType: section.type, circuitGroup: item.circuitGroup! })}
                              style={{
                                fontSize: 11, color: circuitColor!, background: 'none', border: 'none',
                                cursor: 'pointer', opacity: 0.8, marginLeft: 4,
                              }}
                              title="Save as preset"
                            >
                              🔖
                            </button>
                          )}
                        </div>
                      )}

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

                          {/* Circuit assignment */}
                          <div style={{ flex: '1 0 100%', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                            <span className="create-config-label" style={{ display: 'block', marginBottom: 6 }}>
                              Circuit group
                            </span>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                style={{
                                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  background: item.circuitGroup == null ? 'var(--surface-2)' : 'transparent',
                                  color: item.circuitGroup == null ? 'var(--text)' : 'var(--text-muted)',
                                  border: '1.5px solid var(--border)', cursor: 'pointer',
                                }}
                                onClick={() => updateItem(section.type, item.id, { circuitGroup: null })}
                              >
                                None
                              </button>
                              {existingCircuits.map((g) => {
                                const cl = CIRCUIT_COLORS[(g - 1) % CIRCUIT_COLORS.length]
                                return (
                                  <button
                                    key={g}
                                    type="button"
                                    style={{
                                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                      background: item.circuitGroup === g
                                        ? cl
                                        : `color-mix(in srgb, ${cl} 14%, transparent)`,
                                      color: item.circuitGroup === g ? '#fff' : cl,
                                      border: 'none', cursor: 'pointer',
                                    }}
                                    onClick={() => updateItem(section.type, item.id, { circuitGroup: g })}
                                  >
                                    {CIRCUIT_LETTERS[(g - 1) % CIRCUIT_LETTERS.length]}
                                  </button>
                                )
                              })}
                              {maxCircuit < 5 && (
                                <button
                                  type="button"
                                  style={{
                                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                    background: 'transparent', color: 'var(--text-muted)',
                                    border: '1.5px dashed var(--border)', cursor: 'pointer',
                                  }}
                                  onClick={() => updateItem(section.type, item.id, { circuitGroup: maxCircuit + 1 })}
                                >
                                  + New
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              })()}

              <button type="button" className="add-exercise-btn" onClick={() => openPicker(section.type)}>
                <Plus size={14} strokeWidth={2.5} />
                Add exercise
              </button>

              {/* From saved circuit button */}
              {(!presetsLoaded || presets.length > 0) && (
                <button
                  type="button"
                  className="add-exercise-btn"
                  onClick={() => { void loadPresets(); setShowPresetPicker(section.type) }}
                  style={{ marginTop: 6, color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  From saved circuit
                </button>
              )}
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

      {/* Exercise picker overlay */}
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
              value={pickerSearchInput}
              onChange={(e) => handlePickerSearchChange(e.target.value)}
            />
          </div>

          {/* Filter chips */}
          <div style={{ marginTop: 10 }}>
            {/* Chip row */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Equipment chip */}
              <button
                type="button"
                onClick={() => setOpenFilter(openFilter === 'equipment' ? null : 'equipment')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 12, padding: '5px 10px',
                  borderRadius: 14,
                  border: `1.5px solid ${pickerEquipment ? 'var(--primary)' : openFilter === 'equipment' ? 'var(--primary)' : 'var(--border)'}`,
                  background: pickerEquipment
                    ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                    : openFilter === 'equipment'
                      ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                      : 'var(--surface-2)',
                  color: pickerEquipment || openFilter === 'equipment' ? 'var(--primary)' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {pickerEquipment ? EQUIPMENT_LABELS[pickerEquipment] : 'Equipment'}
                <ChevronDown size={11} strokeWidth={2.5} style={{ transform: openFilter === 'equipment' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {/* Muscle chip */}
              <button
                type="button"
                onClick={() => setOpenFilter(openFilter === 'muscle' ? null : 'muscle')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 12, padding: '5px 10px',
                  borderRadius: 14,
                  border: `1.5px solid ${pickerMuscle ? 'var(--primary)' : openFilter === 'muscle' ? 'var(--primary)' : 'var(--border)'}`,
                  background: pickerMuscle
                    ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                    : openFilter === 'muscle'
                      ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                      : 'var(--surface-2)',
                  color: pickerMuscle || openFilter === 'muscle' ? 'var(--primary)' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {pickerMuscle ? MUSCLE_GROUP_LABELS[pickerMuscle] : 'Muscle'}
                <ChevronDown size={11} strokeWidth={2.5} style={{ transform: openFilter === 'muscle' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {/* Clear */}
              {(pickerEquipment || pickerMuscle) && (
                <button
                  type="button"
                  onClick={() => { setPickerEquipment(''); setPickerMuscle(''); setOpenFilter(null) }}
                  style={{
                    fontSize: 12, padding: '5px 10px',
                    borderRadius: 14,
                    border: '1.5px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Options panel */}
            {openFilter && (
              <div style={{
                marginTop: 8,
                padding: '10px 4px',
                borderRadius: 10,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                display: 'flex', flexWrap: 'wrap', gap: 6,
              }}>
                {openFilter === 'equipment' &&
                  Object.entries(EQUIPMENT_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setPickerEquipment(value); setOpenFilter(null) }}
                      style={{
                        fontSize: 12, padding: '4px 10px',
                        borderRadius: 12,
                        border: `1px solid ${pickerEquipment === value ? 'var(--primary)' : 'var(--border)'}`,
                        background: pickerEquipment === value ? 'var(--primary)' : 'transparent',
                        color: pickerEquipment === value ? 'white' : 'var(--text)',
                      }}
                    >
                      {label}
                    </button>
                  ))
                }
                {openFilter === 'muscle' &&
                  Object.entries(MUSCLE_GROUP_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setPickerMuscle(value); setOpenFilter(null) }}
                      style={{
                        fontSize: 12, padding: '4px 10px',
                        borderRadius: 12,
                        border: `1px solid ${pickerMuscle === value ? 'var(--primary)' : 'var(--border)'}`,
                        background: pickerMuscle === value ? 'var(--primary)' : 'transparent',
                        color: pickerMuscle === value ? 'white' : 'var(--text)',
                      }}
                    >
                      {label}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        <div ref={pickerScrollRef} className="bottom-sheet-content">
          {!pickerSearch && !pickerEquipment && !pickerMuscle && pickerResults.length > 0 && !isSearching && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 20px 4px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Most used
            </div>
          )}

          {isSearching && (
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Searching…
            </div>
          )}
          {!isSearching && pickerResults.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {pickerSearch || pickerEquipment || pickerMuscle ? 'No exercises found' : 'No exercises available'}
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

          {/* Infinite scroll sentinel */}
          <div ref={pickerSentinelRef} style={{ height: 1 }} />
          {isPickerFetchingMore && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Loading more...
            </div>
          )}
        </div>
      </div>

      {/* Preset picker overlay */}
      <div
        className={`bottom-sheet-overlay${showPresetPicker ? ' open' : ''}`}
        onClick={() => setShowPresetPicker(null)}
      />

      {/* Preset picker bottom sheet */}
      <div className={`bottom-sheet${showPresetPicker ? ' open' : ''}`}>
        <div className="bottom-sheet-handle" />

        <div className="bottom-sheet-header">
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 4,
          }}>
            <div className="bottom-sheet-title">
              Saved circuits
            </div>
            <button
              type="button"
              onClick={() => setShowPresetPicker(null)}
              style={{ color: 'var(--text-muted)', padding: 4 }}
              aria-label="Close preset picker"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="bottom-sheet-content">
          {!presetsLoaded && (
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading…
            </div>
          )}

          {presetsLoaded && presets.length === 0 && (
            <div style={{
              padding: '32px 20px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              No saved circuits yet. Save a circuit using the bookmark icon in a circuit header.
            </div>
          )}

          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => showPresetPicker && insertPreset(showPresetPicker, preset)}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 20px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {preset.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {preset.items.length} {preset.items.length === 1 ? 'exercise' : 'exercises'}
                {preset.rounds != null ? ` · ${preset.rounds} rounds` : ''}
                {preset.circuitRestSeconds != null ? ` · ${preset.circuitRestSeconds}s rest` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
