import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, Dumbbell, ChevronRight, Plus, AlertCircle, Lock, Globe, BookMarked, X, Check } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { AppHeader } from '../../components/AppHeader'
import {
  listWorkouts, listMyWorkouts, type Workout,
  listCollections, createCollection, deleteCollection, addWorkoutToCollection,
  removeWorkoutFromCollection, getCollectionsForWorkout, getCollectionWorkoutIds,
} from '../../lib/api'
import type { WorkoutCollection } from '../../types/collection'

type ViewMode = 'discover' | 'mine'
type SectionFilter = 'all' | 'warmup' | 'main' | 'cooldown'

const SECTION_FILTERS: { key: SectionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'warmup', label: 'Warmup' },
  { key: 'main', label: 'Main' },
  { key: 'cooldown', label: 'Cooldown' },
]

const ACCENT_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5E5CE6', '#FF2D55']
const EMOJI_OPTIONS = ['📋', '🔥', '💪', '⚡', '🎯', '🏋️', '🧘', '🚀', '⭐', '🏃']

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

// ── Create Collection Bottom Sheet ─────────────────────────────────────────

interface CreateCollectionSheetProps {
  onClose: () => void
  onCreate: (c: WorkoutCollection) => void
}

function CreateCollectionSheet({ onClose, onCreate }: CreateCollectionSheetProps) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📋')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const c = await createCollection({ name: name.trim(), emoji })
      onCreate(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating collection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--surface)',
        borderRadius: '20px 20px 0 0',
        padding: '20px 20px 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Nueva colección</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Emoji picker */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {EMOJI_OPTIONS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              style={{
                width: 40, height: 40, borderRadius: 10, fontSize: 20,
                border: emoji === e ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: emoji === e ? 'color-mix(in srgb, var(--primary) 12%, var(--surface))' : 'var(--surface)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {e}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Nombre de la colección"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 14px',
            fontSize: 15, color: 'var(--text)', fontFamily: 'inherit',
            outline: 'none', marginBottom: 12,
          }}
          autoFocus
        />

        {error && (
          <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>{error}</div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!name.trim() || saving}
          onClick={handleCreate}
        >
          {saving ? 'Creando…' : 'Crear colección'}
        </button>
      </div>
    </div>
  )
}

// ── Manage Collections Bottom Sheet ────────────────────────────────────────

interface ManageCollectionsSheetProps {
  workout: Workout
  collections: WorkoutCollection[]
  onClose: () => void
  onCollectionsChanged: (collections: WorkoutCollection[]) => void
}

function ManageCollectionsSheet({ workout, collections, onClose, onCollectionsChanged }: ManageCollectionsSheetProps) {
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    getCollectionsForWorkout(workout.id)
      .then(res => setMemberIds(new Set(res.collectionIds)))
      .catch(() => {})
  }, [workout.id])

  async function toggle(collectionId: string) {
    const isMember = memberIds.has(collectionId)
    setLoadingIds(prev => new Set(prev).add(collectionId))
    try {
      if (isMember) {
        await removeWorkoutFromCollection(collectionId, workout.id)
        setMemberIds(prev => { const s = new Set(prev); s.delete(collectionId); return s })
      } else {
        await addWorkoutToCollection(collectionId, workout.id)
        setMemberIds(prev => new Set(prev).add(collectionId))
      }
    } catch { /* ignore */ }
    setLoadingIds(prev => { const s = new Set(prev); s.delete(collectionId); return s })
  }

  function handleNewCollection(c: WorkoutCollection) {
    onCollectionsChanged([...collections, c])
    setShowCreate(false)
    toggle(c.id)
  }

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
          onClick={onClose}
        />
        <div style={{
          position: 'relative', zIndex: 1,
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 32px',
          maxHeight: '70vh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Guardar en colección</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{workout.name}</div>

          {collections.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No tenés colecciones todavía.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
              {collections.map(c => {
                const isMember = memberIds.has(c.id)
                const isLoading = loadingIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => !isLoading && toggle(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 12,
                      background: isMember ? 'color-mix(in srgb, var(--primary) 10%, var(--surface))' : 'var(--surface-2)',
                      border: isMember ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' : '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{c.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.workoutCount} workouts</div>
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isMember ? 'var(--primary)' : 'var(--surface)',
                      border: isMember ? 'none' : '2px solid var(--border)',
                    }}>
                      {isMember && <Check size={13} color="#fff" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px', borderRadius: 12,
              background: 'none', border: '1.5px dashed var(--border)',
              fontSize: 14, fontWeight: 600, color: 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={16} /> Nueva colección
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateCollectionSheet
          onClose={() => setShowCreate(false)}
          onCreate={handleNewCollection}
        />
      )}
    </>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function WorkoutsPage() {
  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState<ViewMode>('discover')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')

  // Collections state
  const [collections, setCollections] = useState<WorkoutCollection[]>([])
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [collectionWorkoutIds, setCollectionWorkoutIds] = useState<Set<string>>(new Set())
  const [managingWorkout, setManagingWorkout] = useState<Workout | null>(null)
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<WorkoutCollection | null>(null)
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null)

  async function handleDeleteCollection(col: WorkoutCollection) {
    setDeletingCollectionId(col.id)
    try {
      await deleteCollection(col.id)
      setCollections(prev => prev.filter(c => c.id !== col.id))
      if (activeCollectionId === col.id) setActiveCollectionId(null)
    } catch { /* ignore */ }
    setDeletingCollectionId(null)
    setConfirmDeleteCollection(null)
  }

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
    if (viewMode === 'mine') {
      listCollections()
        .then(res => setCollections(res.data))
        .catch(() => {})
    } else {
      setCollections([])
      setActiveCollectionId(null)
      setCollectionWorkoutIds(new Set())
    }
  }, [viewMode, fetchWorkouts])

  useEffect(() => {
    if (!activeCollectionId) {
      setCollectionWorkoutIds(new Set())
      return
    }
    getCollectionWorkoutIds(activeCollectionId)
      .then(res => setCollectionWorkoutIds(new Set(res.workoutIds)))
      .catch(() => setCollectionWorkoutIds(new Set()))
  }, [activeCollectionId])

  function switchView(mode: ViewMode) {
    if (mode === viewMode) return
    setSearch('')
    setSectionFilter('all')
    setWorkouts([])
    setActiveCollectionId(null)
    setViewMode(mode)
  }

  const filtered = workouts.filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase())
    const matchesSection = sectionFilter === 'all' || getSectionType(w) === sectionFilter
    const matchesCollection = !activeCollectionId || collectionWorkoutIds.has(w.id)
    return matchesSearch && matchesSection && matchesCollection
  })

  return (
    <div className="phone-shell">
      <AppHeader
        title="Workouts"
        action={
          <button
            className="header-action-btn"
            aria-label="New workout"
            onClick={() => navigate('/workouts/new')}
          >
            <Plus size={16} />
            New
          </button>
        }
      />

      <div className="content">

        {/* Challenges banner */}
        <button
          type="button"
          onClick={() => navigate('/challenges')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            marginBottom: 14,
            background: 'linear-gradient(135deg, color-mix(in srgb, #FF6B35 18%, var(--surface)), color-mix(in srgb, #FFB830 12%, var(--surface)))',
            border: '1px solid color-mix(in srgb, var(--primary) 30%, var(--border))',
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            transition: 'opacity var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'color-mix(in srgb, var(--primary) 20%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>
            🏆
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              Challenges
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Compete and push your limits
            </div>
          </div>
          <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }}>
            <ChevronRight size={18} />
          </div>
        </button>

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

        {/* Filter pills — collections on mine tab, section filters on discover */}
        {viewMode === 'mine' ? (
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
            marginBottom: 12, scrollbarWidth: 'none',
          }}>
            <button
              type="button"
              onClick={() => setActiveCollectionId(null)}
              className={`tab-pill${!activeCollectionId ? ' active' : ''}`}
            >
              Todos
            </button>
            {collections.map(c => (
              <div
                key={c.id}
                className={`tab-pill${activeCollectionId === c.id ? ' active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: 0, overflow: 'hidden' }}
              >
                <button
                  type="button"
                  onClick={() => setActiveCollectionId(activeCollectionId === c.id ? null : c.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 8px 6px 14px', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: 600,
                    color: activeCollectionId === c.id ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  <span>{c.emoji}</span>
                  {c.name}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteCollection(c) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    padding: '6px 10px 6px 2px',
                    color: activeCollectionId === c.id ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  }}
                  aria-label="Eliminar colección"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowCreateCollection(true)}
              className="tab-pill"
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, borderStyle: 'dashed' }}
            >
              <Plus size={13} /> Nueva
            </button>
          </div>
        ) : (
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
        )}

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
            <div style={{ fontSize: 48 }}>
              {activeCollectionId ? '📂' : viewMode === 'mine' ? '🏗️' : '💪'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {activeCollectionId
                ? 'Colección vacía'
                : search ? 'No workouts found' : viewMode === 'mine' ? 'No workouts yet' : 'Nothing here'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {activeCollectionId
                ? 'Guardá workouts en esta colección con el botón 📋.'
                : search ? 'Try a different search term.'
                : viewMode === 'mine' ? 'Create your first workout and it will appear here.'
                : 'No public workouts available.'}
            </div>
            {!search && viewMode === 'mine' && !activeCollectionId && (
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
                    {viewMode === 'mine' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setManagingWorkout(w)
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: 6, borderRadius: 8,
                          display: 'flex', alignItems: 'center',
                        }}
                        aria-label="Manage collections"
                      >
                        <BookMarked size={16} />
                      </button>
                    )}
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

      {/* Confirm delete collection bottom sheet */}
      {confirmDeleteCollection && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmDeleteCollection(null)} />
          <div style={{ position: 'relative', zIndex: 1, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px' }}>
            <div style={{ fontSize: 22, marginBottom: 8, textAlign: 'center' }}>{confirmDeleteCollection.emoji}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
              ¿Eliminar "{confirmDeleteCollection.name}"?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20 }}>
              Los workouts no se eliminan, solo la colección.
            </div>
            <button
              className="btn btn-danger"
              style={{ width: '100%', marginBottom: 10 }}
              disabled={deletingCollectionId === confirmDeleteCollection.id}
              onClick={() => handleDeleteCollection(confirmDeleteCollection)}
            >
              {deletingCollectionId === confirmDeleteCollection.id ? 'Eliminando…' : 'Eliminar colección'}
            </button>
            <button
              className="btn btn-outline"
              style={{ width: '100%' }}
              onClick={() => setConfirmDeleteCollection(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Manage collections bottom sheet */}
      {managingWorkout && (
        <ManageCollectionsSheet
          workout={managingWorkout}
          collections={collections}
          onClose={() => setManagingWorkout(null)}
          onCollectionsChanged={setCollections}
        />
      )}

      {/* Create collection bottom sheet (standalone, from shortcut button) */}
      {showCreateCollection && (
        <CreateCollectionSheet
          onClose={() => setShowCreateCollection(false)}
          onCreate={(c) => {
            setCollections(prev => [...prev, c])
            setShowCreateCollection(false)
          }}
        />
      )}
    </div>
  )
}
