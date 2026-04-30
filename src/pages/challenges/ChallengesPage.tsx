import { useState, useEffect, useRef, useCallback } from 'react'
import { Trophy, Plus, Trash2, X, Search, CheckCircle2 } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import {
  listChallenges,
  listMyChallenges,
  startChallenge,
  getMyRuns,
  logChallengeProgress,
  createChallenge,
  deleteChallenge,
  listExercises,
} from '../../lib/api'
import { getUser } from '../../lib/auth'
import type {
  Challenge,
  UserChallenge,
  ChallengeItemProgress,
  CreateChallengeInput,
  ChallengeType,
} from '../../types/challenge'
import type { ExerciseBasic } from '../../lib/api'

type Tab = 'activos' | 'explorar' | 'historial'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysRemaining(endsAt: string): number {
  const end = new Date(endsAt)
  const now = new Date()
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ChallengeType }) {
  if (type === 'cumulative') {
    return (
      <span className="pill pill-success" style={{ fontSize: 10 }}>
        Acumulado
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 9999, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
      background: 'color-mix(in srgb, #5AC8FA 15%, transparent)',
      color: '#5AC8FA',
    }}>
      Diario
    </span>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ItemProgressBar({ item }: { item: ChallengeItemProgress }) {
  const pct = item.target > 0 ? Math.min(100, Math.round((item.logged / item.target) * 100)) : 0
  const unit = item.metric === 'time_seconds' ? 'seg' : 'reps'
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
          {item.exerciseName}
        </span>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {item.logged} / {item.target} {unit}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 3,
          background: item.isComplete ? 'var(--success)' : 'var(--primary)',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── Log Progress Modal ─────────────────────────────────────────────────────────

interface LogModalProps {
  run: UserChallenge
  onClose: () => void
  onSubmit: (runId: string, items: { itemId: string; metric: 'reps' | 'time_seconds'; value: number }[]) => Promise<void>
}

function LogModal({ run, onClose, onSubmit }: LogModalProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setValue(itemId: string, val: string) {
    setValues(prev => ({ ...prev, [itemId]: val }))
  }

  async function handleSubmit() {
    const entries = run.items
      .map(item => ({
        itemId: item.itemId,
        metric: item.metric,
        value: parseInt(values[item.itemId] ?? '0', 10),
      }))
      .filter(e => e.value > 0)

    if (entries.length === 0) {
      setError('Ingresa al menos un valor mayor a 0.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(run.id, entries)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        width: '100%', maxWidth: 430, margin: '0 auto',
        background: 'var(--surface)',
        borderRadius: '20px 20px 0 0',
        padding: '20px 20px 40px',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Registrar progreso</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{run.challengeTitle}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
            aria-label="Cerrar"
          >
            <X size={22} />
          </button>
        </div>

        {/* Items */}
        {run.items.map(item => {
          const unit = item.metric === 'time_seconds' ? 'seg' : 'reps'
          return (
            <div key={item.itemId} style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                {item.exerciseName}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={values[item.itemId] ?? ''}
                  onChange={e => setValue(item.itemId, e.target.value)}
                  className="form-input"
                  style={{ flex: 1, height: 44, fontSize: 15 }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{unit}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                ({item.logged} / {item.target} registrados)
              </div>
            </div>
          )
        })}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-primary"
          style={{ opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Guardando...' : 'Guardar progreso'}
        </button>
      </div>
    </div>
  )
}

// ── Active challenge card ──────────────────────────────────────────────────────

interface ActiveCardProps {
  run: UserChallenge
  onLog: (run: UserChallenge) => void
}

function ActiveCard({ run, onLog }: ActiveCardProps) {
  const days = daysRemaining(run.endsAt)
  const isWarning = days <= 2
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {run.challengeTitle}
          </div>
          <TypeBadge type={run.challengeType} />
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2,
          color: isWarning ? 'var(--secondary)' : 'var(--text-muted)',
        }}>
          {days === 0 ? 'Hoy vence' : `${days}d restantes`}
        </div>
      </div>

      {run.items.map(item => (
        <ItemProgressBar key={item.itemId} item={item} />
      ))}

      <button
        onClick={() => onLog(run)}
        className="btn btn-outline"
        style={{ height: 40, fontSize: 13, marginTop: 4 }}
      >
        Registrar progreso
      </button>
    </div>
  )
}

// ── Challenge explore card ─────────────────────────────────────────────────────

interface ExploreCardProps {
  challenge: Challenge
  isActive: boolean
  isOwn: boolean
  onStart: (challengeId: string) => Promise<void>
  onDelete: (challengeId: string) => Promise<void>
}

function ExploreCard({ challenge, isActive, isOwn, onStart, onDelete }: ExploreCardProps) {
  const [starting, setStarting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleStart() {
    setStarting(true)
    try { await onStart(challenge.id) } finally { setStarting(false) }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este desafío?')) return
    setDeleting(true)
    try { await onDelete(challenge.id) } finally { setDeleting(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {challenge.title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <TypeBadge type={challenge.type} />
            <span className="pill pill-muted" style={{ fontSize: 10 }}>
              {challenge.durationDays} días
            </span>
          </div>
        </div>
        {isOwn && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, flexShrink: 0, opacity: deleting ? 0.5 : 1 }}
            aria-label="Eliminar desafío"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {challenge.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          {challenge.description}
        </div>
      )}

      {challenge.items.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {challenge.items.map(item => (
            <div key={item.id} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>•</span>
              <span>
                {item.exerciseName}
                {item.targetReps != null ? ` — ${item.targetReps} reps` : ''}
                {item.targetSeconds != null ? ` — ${item.targetSeconds} seg` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {isActive ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: 'color-mix(in srgb, var(--success) 12%, transparent)',
          color: 'var(--success)',
        }}>
          <CheckCircle2 size={14} />
          En curso
        </div>
      ) : (
        <button
          onClick={handleStart}
          disabled={starting}
          className="btn btn-outline"
          style={{ height: 40, fontSize: 13, opacity: starting ? 0.7 : 1 }}
        >
          {starting ? 'Iniciando...' : 'Iniciar desafío'}
        </button>
      )}
    </div>
  )
}

// ── History card ──────────────────────────────────────────────────────────────

function HistoryCard({ run }: { run: UserChallenge }) {
  const isCompleted = run.status === 'completed'
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {run.challengeTitle}
          </div>
          <TypeBadge type={run.challengeType} />
        </div>
        <span className={isCompleted ? 'pill pill-success' : 'pill pill-danger'} style={{ fontSize: 10, flexShrink: 0 }}>
          {isCompleted ? 'Completado' : 'Fallido'}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        {formatDate(run.startedAt)} — {formatDate(run.endsAt)}
      </div>

      {run.items.map(item => (
        <ItemProgressBar key={item.itemId} item={item} />
      ))}
    </div>
  )
}

// ── Create Challenge Form (full-screen overlay) ───────────────────────────────

interface AddedExercise {
  exercise: ExerciseBasic
  metric: 'reps' | 'seconds'
  target: string
}

interface CreateFormProps {
  onClose: () => void
  onCreated: (challenge: Challenge) => void
}

function CreateChallengeForm({ onClose, onCreated }: CreateFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ChallengeType>('cumulative')
  const [durationDays, setDurationDays] = useState('30')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ExerciseBasic[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [added, setAdded] = useState<AddedExercise[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback((query: string) => {
    setSearchLoading(true)
    listExercises(query || undefined, 1, 20)
      .then(res => setSearchResults(res.data))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, doSearch])

  function toggleExercise(ex: ExerciseBasic) {
    const exists = added.find(a => a.exercise.id === ex.id)
    if (exists) {
      setAdded(prev => prev.filter(a => a.exercise.id !== ex.id))
    } else {
      setAdded(prev => [...prev, { exercise: ex, metric: 'reps', target: '' }])
    }
  }

  function updateAdded(exerciseId: string, field: 'metric' | 'target', value: string) {
    setAdded(prev => prev.map(a =>
      a.exercise.id === exerciseId ? { ...a, [field]: value } : a
    ))
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('El título es obligatorio.'); return }
    if (added.length === 0) { setError('Agrega al menos un ejercicio.'); return }
    const days = parseInt(durationDays, 10)
    if (isNaN(days) || days < 1) { setError('La duración debe ser al menos 1 día.'); return }

    const payload: CreateChallengeInput = {
      title: title.trim(),
      description: description.trim(),
      type,
      durationDays: days,
      isPublic: true,
      items: added.map((a, i) => ({
        exerciseId: a.exercise.id,
        orderIndex: i,
        ...(a.metric === 'reps' && a.target ? { targetReps: parseInt(a.target, 10) } : {}),
        ...(a.metric === 'seconds' && a.target ? { targetSeconds: parseInt(a.target, 10) } : {}),
      })),
    }

    setSubmitting(true)
    setError(null)
    try {
      const created = await createChallenge(payload)
      onCreated(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
      setSubmitting(false)
    }
  }

  const isAdded = (id: string) => added.some(a => a.exercise.id === id)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      maxWidth: 430, margin: '0 auto',
    }}>
      {/* Header */}
      <header className="app-header">
        <span className="header-title">Nuevo desafío</span>
        <button
          onClick={onClose}
          className="header-icon-btn"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </header>

      {/* Scrollable body */}
      <div className="content">

        {/* Title */}
        <div className="form-field">
          <label className="form-label">Título</label>
          <input
            type="text"
            className="form-input"
            placeholder="Nombre del desafío"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="form-field">
          <label className="form-label">Descripción</label>
          <textarea
            className="form-input"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            style={{ resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        {/* Type selector */}
        <div className="form-field">
          <label className="form-label">Tipo</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['cumulative', 'daily'] as ChallengeType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  flex: 1, height: 44, borderRadius: 10, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${type === t ? 'var(--primary)' : 'var(--border)'}`,
                  background: type === t ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  color: type === t ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all var(--transition)',
                }}
              >
                {t === 'cumulative' ? 'Acumulado' : 'Diario'}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="form-field">
          <label className="form-label">Duración (días)</label>
          <input
            type="number"
            min={1}
            className="form-input"
            placeholder="30"
            value={durationDays}
            onChange={e => setDurationDays(e.target.value)}
          />
        </div>

        {/* Exercise search */}
        <div className="form-field">
          <label className="form-label">Buscar ejercicios</label>
          <div className="search-wrap">
            <Search size={16} />
            <input
              type="search"
              className="search-input"
              placeholder="Buscar ejercicio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Results */}
          {(searchLoading || searchResults.length > 0) && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              marginTop: 8,
              maxHeight: 200,
              overflowY: 'auto',
            }}>
              {searchLoading && (
                <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>Buscando...</div>
              )}
              {!searchLoading && searchResults.map(ex => {
                const selected = isAdded(ex.id)
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => toggleExercise(ex)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px', background: 'none', border: 'none',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ex.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
                        {ex.primaryMuscle}
                      </div>
                    </div>
                    {selected && <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Added exercises */}
        {added.length > 0 && (
          <div className="form-field">
            <label className="form-label">Ejercicios agregados</label>
            {added.map(a => (
              <div key={a.exercise.id} style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                    {a.exercise.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdded(prev => prev.filter(x => x.exercise.id !== a.exercise.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2, flexShrink: 0 }}
                    aria-label="Quitar"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {(['reps', 'seconds'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateAdded(a.exercise.id, 'metric', m)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          border: `1.5px solid ${a.metric === m ? 'var(--primary)' : 'var(--border)'}`,
                          background: a.metric === m ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                          color: a.metric === m ? 'var(--primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {m === 'reps' ? 'Reps' : 'Seg'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={1}
                    placeholder={a.metric === 'reps' ? 'Meta reps' : 'Meta seg'}
                    value={a.target}
                    onChange={e => updateAdded(a.exercise.id, 'target', e.target.value)}
                    className="form-input"
                    style={{ flex: 1, height: 38, fontSize: 13 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-primary"
          style={{ opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Creando...' : 'Crear desafío'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ChallengesPage() {
  const user = getUser()
  const [activeTab, setActiveTab] = useState<Tab>('activos')

  // Runs state
  const [activeRuns, setActiveRuns] = useState<UserChallenge[]>([])
  const [historyRuns, setHistoryRuns] = useState<UserChallenge[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [runsError, setRunsError] = useState<string | null>(null)

  // Explorar state
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [exploreLoaded, setExploreLoaded] = useState(false)
  const [exploreLoading, setExploreLoading] = useState(false)
  const [exploreError, setExploreError] = useState<string | null>(null)

  // Modals
  const [logRun, setLogRun] = useState<UserChallenge | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // ── Load runs on mount ──────────────────────────────────────────────────

  const fetchRuns = useCallback(() => {
    setRunsLoading(true)
    setRunsError(null)
    getMyRuns()
      .then(res => {
        setActiveRuns(res.data.filter(r => r.status === 'active'))
        setHistoryRuns(res.data.filter(r => r.status !== 'active'))
      })
      .catch(e => setRunsError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setRunsLoading(false))
  }, [])

  useEffect(() => { fetchRuns() }, [fetchRuns])

  // ── Load explore lazily ─────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'explorar' || exploreLoaded) return
    setExploreLoading(true)
    setExploreError(null)
    Promise.all([listChallenges(), listMyChallenges()])
      .then(([all, mine]) => {
        // mine first, then public, deduped by id
        const mineIds = new Set(mine.data.map(c => c.id))
        const mineFirst = [...mine.data]
        const rest = all.data.filter(c => !mineIds.has(c.id))
        setChallenges([...mineFirst, ...rest])
        setExploreLoaded(true)
      })
      .catch(e => setExploreError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setExploreLoading(false))
  }, [activeTab, exploreLoaded])

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleStart(challengeId: string) {
    await startChallenge(challengeId)
    // Refresh runs and switch to activos
    setActiveTab('activos')
    fetchRuns()
  }

  async function handleDelete(challengeId: string) {
    await deleteChallenge(challengeId)
    setChallenges(prev => prev.filter(c => c.id !== challengeId))
  }

  async function handleLog(
    runId: string,
    items: { itemId: string; metric: 'reps' | 'time_seconds'; value: number }[],
  ) {
    const date = today()
    await Promise.all(
      items.map(item =>
        logChallengeProgress(runId, {
          challengeItemId: item.itemId,
          ...(item.metric === 'reps' ? { reps: item.value } : { seconds: item.value }),
          date,
        })
      )
    )
    // Refresh active runs after logging
    fetchRuns()
  }

  function handleChallengeCreated(challenge: Challenge) {
    setShowCreate(false)
    // Add to explore list if loaded
    if (exploreLoaded) {
      setChallenges(prev => [challenge, ...prev])
    }
  }

  const activeRunIds = new Set(activeRuns.map(r => r.challengeId))

  return (
    <div className="phone-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={20} color="var(--primary)" />
          <span className="header-title">Challenges</span>
        </div>
        {activeTab === 'explorar' && (
          <button
            className="header-action-btn"
            onClick={() => setShowCreate(true)}
            aria-label="Crear desafío"
          >
            <Plus size={16} />
            Nuevo
          </button>
        )}
      </header>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        {(['activos', 'explorar', 'historial'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '12px 0',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'activos' ? 'Activos' : tab === 'explorar' ? 'Explorar' : 'Historial'}
          </button>
        ))}
      </div>

      <div className="content">

        {/* ── ACTIVOS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'activos' && (
          <>
            {runsLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
                Cargando...
              </div>
            )}
            {!runsLoading && runsError && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{runsError}</div>
                <button className="btn btn-outline" style={{ width: 'auto' }} onClick={fetchRuns}>
                  Reintentar
                </button>
              </div>
            )}
            {!runsLoading && !runsError && activeRuns.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 12, padding: '60px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48 }}>🏆</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  No tenés desafíos activos
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Explorá los desafíos disponibles y empezá uno.
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: 'auto', marginTop: 4 }}
                  onClick={() => setActiveTab('explorar')}
                >
                  Explorar desafíos
                </button>
              </div>
            )}
            {!runsLoading && !runsError && activeRuns.map(run => (
              <ActiveCard key={run.id} run={run} onLog={setLogRun} />
            ))}
          </>
        )}

        {/* ── EXPLORAR TAB ───────────────────────────────────────────────── */}
        {activeTab === 'explorar' && (
          <>
            {exploreLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
                Cargando...
              </div>
            )}
            {!exploreLoading && exploreError && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{exploreError}</div>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto' }}
                  onClick={() => { setExploreLoaded(false) }}
                >
                  Reintentar
                </button>
              </div>
            )}
            {!exploreLoading && !exploreError && challenges.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 12, padding: '60px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48 }}>🎯</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  No hay desafíos disponibles
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Creá el primero con el botón "Nuevo".
                </div>
              </div>
            )}
            {!exploreLoading && !exploreError && challenges.map(challenge => (
              <ExploreCard
                key={challenge.id}
                challenge={challenge}
                isActive={activeRunIds.has(challenge.id)}
                isOwn={challenge.createdBy === user?.id}
                onStart={handleStart}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}

        {/* ── HISTORIAL TAB ──────────────────────────────────────────────── */}
        {activeTab === 'historial' && (
          <>
            {runsLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
                Cargando...
              </div>
            )}
            {!runsLoading && !runsError && historyRuns.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 12, padding: '60px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  Aún no tenés desafíos completados
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Completá un desafío y aparecerá aquí.
                </div>
              </div>
            )}
            {!runsLoading && historyRuns.map(run => (
              <HistoryCard key={run.id} run={run} />
            ))}
          </>
        )}
      </div>

      <BottomNav />

      {/* Log progress modal */}
      {logRun && (
        <LogModal
          run={logRun}
          onClose={() => setLogRun(null)}
          onSubmit={handleLog}
        />
      )}

      {/* Create challenge form */}
      {showCreate && (
        <CreateChallengeForm
          onClose={() => setShowCreate(false)}
          onCreated={handleChallengeCreated}
        />
      )}
    </div>
  )
}
