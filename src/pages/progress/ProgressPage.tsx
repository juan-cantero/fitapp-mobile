import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import {
  getMyStats, getMySessions, getMyInsights,
  getWeekMuscleCoverage, getSessionMuscles, getWeeklyPlan, generateWeeklyPlan,
} from '../../lib/api'
import type {
  UserStats, Session, SessionInsights,
  WeekMuscleCoverage, SessionMuscleBreakdown, WeeklyPlan, PlanGoalType, SplitValue, ObjectiveValue,
} from '../../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', core: 'Core', adductors: 'Adductors', abductors: 'Abductors',
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#FF6B35', back: '#5AC8FA', shoulders: '#FFB830',
  biceps: '#30D158', triceps: '#BF5AF2', quads: '#FF6B35',
  hamstrings: '#5AC8FA', glutes: '#FFB830', core: '#30D158',
  calves: '#BF5AF2', forearms: '#FF9500', adductors: '#64D2FF', abductors: '#FFD60A',
}

const SESSION_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5AC8FA', '#BF5AF2']

const MUSCLES_ALL = ['glutes','quads','hamstrings','adductors','abductors','calves','chest','back','shoulders','biceps','triceps','forearms','core'] as const

const SPLITS: { value: SplitValue; label: string }[] = [
  { value: 'full_body', label: 'Full Body' },
  { value: 'push_pull_legs', label: 'Push / Pull / Legs' },
  { value: 'upper_lower', label: 'Upper / Lower' },
]

const OBJECTIVES: { value: ObjectiveValue; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'fat_loss', label: 'Fat Loss' },
  { value: 'endurance', label: 'Endurance' },
]

const GOAL_CARDS: { type: PlanGoalType; label: string; desc: string }[] = [
  { type: 'muscle_priority', label: 'Muscle Priority', desc: 'Focus on a specific muscle' },
  { type: 'split', label: 'Training Split', desc: 'Structure by split type' },
  { type: 'objective', label: 'Objective', desc: 'Align to your training goal' },
  { type: 'balanced', label: 'Balanced', desc: 'Maximize muscle variety' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.round(seconds / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m} min`
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`
  return `${kg}`
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

function getMonday(offsetWeeks = 0): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + diff + offsetWeeks * 7)
  return now.toISOString().slice(0, 10)
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

// ── Muscle pills component ────────────────────────────────────────────────────

function MusclePills({ muscles, compact = false }: { muscles: { muscle: string; sets: number }[]; compact?: boolean }) {
  if (muscles.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data</span>
  const max = Math.max(...muscles.map(m => m.sets), 1)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 6 }}>
      {muscles.map(({ muscle, sets }) => {
        const color = MUSCLE_COLORS[muscle] ?? 'var(--primary)'
        const alpha = Math.max(0.2, sets / max)
        return (
          <span
            key={muscle}
            style={{
              padding: compact ? '2px 8px' : '3px 10px',
              borderRadius: 9999,
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              background: `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`,
              color: alpha > 0.5 ? '#fff' : 'var(--text)',
              border: `1px solid ${color}44`,
            }}
          >
            {MUSCLE_LABELS[muscle] ?? muscle}
            {!compact && <span style={{ opacity: 0.7, marginLeft: 3, fontWeight: 400 }}>{sets}</span>}
          </span>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'stats' | 'plan'

export function ProgressPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('stats')

  // Stats tab state
  const [stats, setStats] = useState<UserStats | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [insights, setInsights] = useState<SessionInsights | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Week coverage state
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekData, setWeekData] = useState<WeekMuscleCoverage | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)

  // Per-session muscle state
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [muscleCache, setMuscleCache] = useState<Record<string, SessionMuscleBreakdown>>({})
  const [muscleLoading, setMuscleLoading] = useState<string | null>(null)

  // Plan tab state
  const [plan, setPlan] = useState<WeeklyPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planLoaded, setPlanLoaded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [planStep, setPlanStep] = useState<'type' | 'value'>('type')
  const [selectedType, setSelectedType] = useState<PlanGoalType | null>(null)
  const [selectedMuscle, setSelectedMuscle] = useState<string>('glutes')
  const [selectedSplit, setSelectedSplit] = useState<SplitValue>('full_body')
  const [selectedObjective, setSelectedObjective] = useState<ObjectiveValue>('strength')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchStats = useCallback(() => {
    setIsLoading(true)
    Promise.allSettled([getMyStats(), getMySessions(1, 20), getMyInsights(30)])
      .then(([s, sess, ins]) => {
        if (s.status === 'fulfilled') setStats(s.value)
        if (sess.status === 'fulfilled') setSessions(sess.value.data)
        if (ins.status === 'fulfilled') setInsights(ins.value)
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => {
    const handle = () => { if (document.visibilityState === 'visible') fetchStats() }
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [fetchStats])

  // Load week coverage when offset changes
  useEffect(() => {
    setWeekLoading(true)
    getWeekMuscleCoverage(getMonday(weekOffset))
      .then(setWeekData)
      .catch(() => setWeekData(null))
      .finally(() => setWeekLoading(false))
  }, [weekOffset])

  // Load plan when switching to plan tab (once)
  useEffect(() => {
    if (activeTab !== 'plan' || planLoaded) return
    setPlanLoading(true)
    getWeeklyPlan()
      .then(({ plan }) => { setPlan(plan); setPlanLoaded(true) })
      .catch(() => setPlanLoaded(true))
      .finally(() => setPlanLoading(false))
  }, [activeTab, planLoaded])

  // ── Session muscle expand ──────────────────────────────────────────────────

  async function toggleSession(id: string) {
    if (expandedSession === id) { setExpandedSession(null); return }
    setExpandedSession(id)
    if (!muscleCache[id]) {
      setMuscleLoading(id)
      try {
        const data = await getSessionMuscles(id)
        setMuscleCache(prev => ({ ...prev, [id]: data }))
      } catch { /* ignore */ }
      finally { setMuscleLoading(null) }
    }
  }

  // ── Plan generation ────────────────────────────────────────────────────────

  async function generate() {
    if (!selectedType) return
    setGenerating(true)
    setPlanError(null)
    try {
      let body: Parameters<typeof generateWeeklyPlan>[0]
      if (selectedType === 'muscle_priority') body = { goalType: 'muscle_priority', goalValue: selectedMuscle }
      else if (selectedType === 'split') body = { goalType: 'split', goalValue: selectedSplit }
      else if (selectedType === 'objective') body = { goalType: 'objective', goalValue: selectedObjective }
      else body = { goalType: 'balanced' }
      const result = await generateWeeklyPlan(body)
      setPlan(result)
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Failed to generate plan')
    } finally {
      setGenerating(false)
    }
  }

  function aggregatedMuscles() {
    if (!plan) return []
    const map: Record<string, number> = {}
    for (const slot of plan.slots) {
      for (const m of slot.muscles) map[m.muscle] = (map[m.muscle] ?? 0) + m.sets
    }
    return Object.entries(map).map(([muscle, sets]) => ({ muscle, sets }))
  }

  const maxMuscleSets = Math.max(...(insights?.topMuscles.map(m => m.sets) ?? [1]), 1)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="phone-shell">
      <header className="app-header">
        <span className="header-title">Progress</span>
      </header>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
      }}>
        {(['stats', 'plan'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '12px 0',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'stats' ? 'Stats' : 'Weekly Plan'}
          </button>
        ))}
      </div>

      <div className="content">

        {/* ── STATS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <>
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

            {/* Week muscle coverage */}
            <div className="card" style={{ marginBottom: 16 }}>
              {/* Week nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <button
                  onClick={() => setWeekOffset(w => w - 1)}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                >
                  <ChevronLeft size={18} />
                </button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {weekData ? formatWeekRange(weekData.weekStart, weekData.weekEnd) : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {weekData ? `${weekData.totalSessions} session${weekData.totalSessions !== 1 ? 's' : ''}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}
                  disabled={weekOffset >= 0}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer', color: weekOffset >= 0 ? 'var(--border)' : 'var(--text-muted)', display: 'flex', opacity: weekOffset >= 0 ? 0.3 : 1 }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {weekLoading ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</div>
              ) : weekData && weekData.muscles.length > 0 ? (
                <MusclePills muscles={weekData.muscles} />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sessions this week.</div>
              )}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{MUSCLE_LABELS[m.muscle] ?? m.muscle}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{m.sets} sets</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Top exercises */}
            {!isLoading && insights && insights.topExercises.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header" style={{ marginBottom: 14 }}>
                  <span className="section-title">Top Exercises</span>
                  <span className="pill pill-primary">Last 30 days</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {insights.topExercises.map((ex, i) => (
                    <div key={ex.exerciseId} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                      borderBottom: i < insights.topExercises.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                        color: 'var(--primary)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {ex.totalReps > 0 ? `${ex.totalReps} reps` : `${ex.totalSets} sets`}
                          {ex.maxWeightKg != null ? ` · max ${ex.maxWeightKg} kg` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 8, padding: '3px 9px', flexShrink: 0 }}>
                        {ex.totalSets} sets
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent sessions — expandable */}
            <div className="section-header">
              <span className="section-title">Recent Sessions</span>
            </div>

            {isLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Loading...</div>
            )}

            {!isLoading && sessions.length === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No sessions yet. Start training!</div>
              </div>
            )}

            {sessions.slice(0, 10).map((s, i) => (
              <div key={s.id} style={{ marginBottom: 2 }}>
                {/* Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: expandedSession === s.id ? '12px 12px 0 0' : 12,
                  padding: '12px 14px',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: SESSION_COLORS[i % SESSION_COLORS.length], flexShrink: 0 }} />
                  <button
                    onClick={() => navigate(`/sessions/${s.id}`)}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.workoutName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatSessionDate(s.startedAt)}{s.durationSeconds ? ` · ${formatDuration(s.durationSeconds)}` : ''}
                    </div>
                  </button>
                  <button
                    onClick={() => toggleSession(s.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}
                    aria-label="Show muscles"
                  >
                    {expandedSession === s.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded muscles */}
                {expandedSession === s.id && (
                  <div style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderTop: 'none', borderRadius: '0 0 12px 12px',
                    padding: '10px 14px 12px',
                  }}>
                    {muscleLoading === s.id ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading...</span>
                    ) : muscleCache[s.id] ? (
                      muscleCache[s.id].muscles.length > 0
                        ? <MusclePills muscles={muscleCache[s.id].muscles} compact />
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sets logged.</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Could not load.</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── PLAN TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'plan' && (
          <>
            {planLoading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 14 }}>Loading...</div>
            )}

            {!planLoading && plan && (
              <>
                {/* Plan header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Weekly Plan</div>
                    <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
                      {plan.goalType.replace(/_/g, ' ')}{plan.goalValue ? `: ${plan.goalValue.replace(/_/g, ' ')}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => { setPlan(null); setPlanStep('type'); setSelectedType(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <RefreshCw size={12} />
                    Change
                  </button>
                </div>

                {/* Slot cards */}
                {plan.slots.map((slot, i) => (
                  <div key={slot.workoutId} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      Session {i + 1}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                      {slot.workoutName}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: slot.muscles.length > 0 ? 10 : 0 }}>
                      {slot.estimatedMinutes && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏱ {slot.estimatedMinutes} min</span>
                      )}
                      {slot.tags.slice(0, 2).map(t => (
                        <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'var(--surface-2)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t}</span>
                      ))}
                    </div>
                    {slot.muscles.length > 0 && <MusclePills muscles={slot.muscles} compact />}
                  </div>
                ))}

                {/* Weekly coverage */}
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Weekly Coverage</div>
                  <MusclePills muscles={aggregatedMuscles()} />
                </div>
              </>
            )}

            {!planLoading && !plan && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Plan Your Week</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Choose a goal to generate your workout schedule.</div>
                </div>

                {planStep === 'type' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {GOAL_CARDS.map(gc => (
                      <button
                        key={gc.type}
                        onClick={() => { setSelectedType(gc.type); setPlanStep('value') }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '16px', borderRadius: 14,
                          background: 'var(--surface)', border: `1.5px solid ${selectedType === gc.type ? 'var(--primary)' : 'var(--border)'}`,
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{gc.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{gc.desc}</div>
                        </div>
                        <ChevronRight size={16} color="var(--text-muted)" />
                      </button>
                    ))}
                  </div>
                )}

                {planStep === 'value' && selectedType && (
                  <>
                    <button
                      onClick={() => { setPlanStep('type'); setSelectedType(null) }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 16, padding: 0 }}
                    >
                      &larr; Back
                    </button>

                    <div className="card" style={{ marginBottom: 16 }}>
                      {selectedType === 'muscle_priority' && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Choose a priority muscle</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {MUSCLES_ALL.map(m => (
                              <button
                                key={m}
                                onClick={() => setSelectedMuscle(m)}
                                style={{
                                  padding: '7px 14px', borderRadius: 9999,
                                  border: `1.5px solid ${selectedMuscle === m ? 'var(--primary)' : 'var(--border)'}`,
                                  background: selectedMuscle === m ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'transparent',
                                  color: selectedMuscle === m ? 'var(--primary)' : 'var(--text-muted)',
                                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                {MUSCLE_LABELS[m]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {selectedType === 'split' && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Choose a training split</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {SPLITS.map(s => (
                              <button
                                key={s.value}
                                onClick={() => setSelectedSplit(s.value)}
                                style={{
                                  padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                                  border: `1.5px solid ${selectedSplit === s.value ? 'var(--primary)' : 'var(--border)'}`,
                                  background: selectedSplit === s.value ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                                  color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {selectedType === 'objective' && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Choose a training objective</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {OBJECTIVES.map(o => (
                              <button
                                key={o.value}
                                onClick={() => setSelectedObjective(o.value)}
                                style={{
                                  padding: '14px 12px', borderRadius: 10, textAlign: 'left',
                                  border: `1.5px solid ${selectedObjective === o.value ? 'var(--primary)' : 'var(--border)'}`,
                                  background: selectedObjective === o.value ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                                  color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {selectedType === 'balanced' && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          We'll pick workouts that cover the most muscle groups across the week.
                        </div>
                      )}
                    </div>

                    {planError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 14 }}>{planError}</div>}

                    <button
                      onClick={generate}
                      disabled={generating}
                      className="btn btn-primary"
                      style={{ width: '100%', opacity: generating ? 0.7 : 1 }}
                    >
                      {generating ? 'Generating...' : 'Generate Plan'}
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
