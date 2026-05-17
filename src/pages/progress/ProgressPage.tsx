import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, RefreshCw, Download, Share2 } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { downloadMarkdown, weeklyReportToMarkdown } from '../../lib/markdown'
import { AppHeader } from '../../components/AppHeader'
import { BodyMapFront, BodyMapBack } from '../../components/BodyMap'
import {
  getMyStats, getMySessions, getMyInsights,
  getWeekMuscleCoverage, getSessionMuscles, getWeeklyPlan, generateWeeklyPlan,
  getExerciseRecords, getSession,
} from '../../lib/api'
import type {
  UserStats, Session, SessionInsights, ExerciseInsight,
  WeekMuscleCoverage, SessionMuscleBreakdown, WeeklyPlan, PlanGoalType, SplitValue, ObjectiveValue,
  ExerciseRecord,
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

// ── Chart colors ──────────────────────────────────────────────────────────────

const CHART_COLORS = ['#FF6B35', '#FFB830', '#30D158', '#5AC8FA', '#BF5AF2']

// ── Helper: minutes per weekday ────────────────────────────────────────────────

function getDayMinutes(sessions: Session[], weekOffset: number): number[] {
  const start = new Date(getMonday(weekOffset) + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const minutes = [0, 0, 0, 0, 0, 0, 0]
  for (const s of sessions) {
    const d = new Date(s.startedAt)
    if (d >= start && d < end) {
      const idx = (d.getDay() + 6) % 7
      minutes[idx] += Math.round((s.durationSeconds ?? 0) / 60)
    }
  }
  return minutes
}


// ── Week insight card ─────────────────────────────────────────────────────────

function WeekInsightCard({ muscles }: { muscles: { muscle: string; sets: number }[] }) {
  if (muscles.length === 0) return null
  const sorted = [...muscles].sort((a, b) => b.sets - a.sets)
  const top = sorted[0]
  const maxSets = top.sets
  const gaps = (MUSCLES_ALL as readonly string[]).filter(m => {
    const found = muscles.find(x => x.muscle === m)
    return !found || found.sets < maxSets * 0.2
  })
  const topLabel = MUSCLE_LABELS[top.muscle] ?? top.muscle
  const gapLabels = gaps.slice(0, 2).map(m => MUSCLE_LABELS[m] ?? m)
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>🔥</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
            Great work on {topLabel} this week!
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{maxSets} sets — keep it up.</div>
        </div>
      </div>
      {gapLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>💡</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Room to grow</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Consider adding more {gapLabels.join(' and ')} next week.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper: total minutes per week (last 4 weeks) ─────────────────────────────

function getWeeklyMinutes(sessions: Session[]): { minutes: number[]; labels: string[] } {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const currentMonday = new Date(now)
  currentMonday.setDate(now.getDate() + diff)
  currentMonday.setHours(0, 0, 0, 0)

  const minutes = [0, 0, 0, 0]
  const labels: string[] = []
  for (let w = 3; w >= 0; w--) {
    const weekStart = new Date(currentMonday)
    weekStart.setDate(currentMonday.getDate() - w * 7)
    labels.push(weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  }
  for (const s of sessions) {
    const d = new Date(s.startedAt)
    const msSince = currentMonday.getTime() - d.getTime()
    const wIdx = Math.floor(msSince / (7 * 24 * 60 * 60 * 1000))
    if (wIdx >= 0 && wIdx <= 3) minutes[3 - wIdx] += Math.round((s.durationSeconds ?? 0) / 60)
  }
  return { minutes, labels }
}

// ── Daily minutes bar chart (dumb presenter) ───────────────────────────────────

function DayBarsChart({ data, labels, highlightIdx }: { data: number[]; labels: string[]; highlightIdx: number }) {
  const max = Math.max(...data, 1)
  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 72 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{
                width: '100%',
                height: v > 0 ? `${Math.max(0.08, v / max) * 100}%` : '3px',
                borderRadius: '4px 4px 2px 2px',
                background: v > 0
                  ? (i === highlightIdx ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 50%, #2a2a2a)')
                  : 'var(--surface-2)',
                transition: 'height 0.4s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: i === highlightIdx ? 'var(--primary)' : 'var(--text-muted)', fontWeight: i === highlightIdx ? 700 : 400, minHeight: 12 }}>
            {v > 0 ? `${v}m` : ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        {labels.map((l, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: i === highlightIdx ? 700 : 400, color: i === highlightIdx ? 'var(--primary)' : 'var(--text-muted)' }}>
            {l}
          </div>
        ))}
      </div>
    </>
  )
}

// ── Workout type donut chart ───────────────────────────────────────────────────

function WorkoutTypeDonut({ muscles }: { muscles: { muscle: string; sets: number }[] }) {
  const top5 = [...muscles].sort((a, b) => b.sets - a.sets).slice(0, 5)
  if (top5.length === 0) return null
  const total = top5.reduce((s, m) => s + m.sets, 0)
  const r = 46, cx = 64, cy = 64, sw = 20
  const C = 2 * Math.PI * r
  let cum = 0
  const segments = top5.map((m, i) => {
    const frac = m.sets / total
    const dashArray = `${frac * C} ${C}`
    const dashOffset = C * 0.25 - cum * C
    cum += frac
    return { ...m, frac, dashArray, dashOffset, color: CHART_COLORS[i] }
  })
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <svg width="128" height="128" viewBox="0 0 128 128" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={sw} />
        {segments.map((seg, i) => (
          <circle
            key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth={sw}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="700" fontFamily="inherit">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="inherit">total sets</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{MUSCLE_LABELS[seg.muscle] ?? seg.muscle}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(seg.frac * 100)}% · {seg.sets} sets</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Canvas share image ────────────────────────────────────────────────────────

const SHARE_MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', core: 'Core', adductors: 'Adductors', abductors: 'Abductors',
}

const SHARE_MUSCLE_COLORS: Record<string, string> = {
  chest: '#FF6B35', back: '#5AC8FA', shoulders: '#FFB830',
  biceps: '#30D158', triceps: '#BF5AF2', quads: '#FF6B35',
  hamstrings: '#5AC8FA', glutes: '#FFB830', core: '#30D158',
  calves: '#BF5AF2', forearms: '#FF9500', adductors: '#64D2FF', abductors: '#FFD60A',
}

async function svgToImg(container: HTMLDivElement): Promise<HTMLImageElement> {
  const svgEl = container.querySelector('svg')
  if (!svgEl) throw new Error('no svg')
  let svgStr = new XMLSerializer().serializeToString(svgEl)
  if (!svgStr.includes('xmlns=')) {
    svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  const b64 = btoa(unescape(encodeURIComponent(svgStr)))
  const dataUrl = `data:image/svg+xml;base64,${b64}`
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function buildShareImage(
  weekData: WeekMuscleCoverage,
  weekSessions: Session[],
  totalSets: number,
  topExercises: ExerciseInsight[],
  frontEl: HTMLDivElement | null,
  backEl: HTMLDivElement | null,
): Promise<Blob> {
  const W = 1080, H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const BG = '#0f0f0f', SURFACE = '#1a1a1a', SURFACE2 = '#252525'
  const PRIMARY = '#FF6B35', WHITE = '#ffffff', MUTED = '#888888', BORDER = '#2a2a2a'
  const PAD = 56

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  function fmtDur(secs: number) {
    const m = Math.round(secs / 60)
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
  }
  function fmtDay(isoStr: string) {
    return new Date(isoStr).toLocaleDateString('en-US', { weekday: 'short' })
  }
  function sectionHeader(label: string, yPos: number) {
    ctx.fillStyle = MUTED
    ctx.font = '700 26px system-ui, sans-serif'
    ctx.fillText(label, PAD, yPos)
    const lw = ctx.measureText(label).width + 20
    ctx.strokeStyle = BORDER
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PAD + lw, yPos - 6)
    ctx.lineTo(W - PAD, yPos - 6)
    ctx.stroke()
  }

  const weekLabel = `${fmtDate(weekData.weekStart)} – ${fmtDate(weekData.weekEnd)}`

  // ── Header ──
  let y = 90
  ctx.fillStyle = PRIMARY
  ctx.beginPath()
  ctx.arc(PAD + 10, y + 10, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.font = '800 38px system-ui, sans-serif'
  ctx.fillText('FITAPP', PAD + 26, y + 19)
  ctx.fillStyle = MUTED
  ctx.font = '600 26px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(weekLabel, W - PAD, y + 19)
  ctx.textAlign = 'left'
  y += 70

  // ── Stats bubbles ──
  const bubbles = [
    { value: weekData.totalSessions, label: 'sessions' },
    { value: weekData.muscles.length, label: 'muscles' },
    { value: totalSets, label: 'sets' },
  ]
  const bGap = 18
  const bW = (W - PAD * 2 - bGap * 2) / 3
  const bH = 140
  for (let i = 0; i < 3; i++) {
    const bx = PAD + i * (bW + bGap)
    ctx.fillStyle = SURFACE
    rrect(ctx, bx, y, bW, bH, 28)
    ctx.fill()
    ctx.strokeStyle = BORDER
    ctx.lineWidth = 1.5
    rrect(ctx, bx, y, bW, bH, 28)
    ctx.stroke()
    ctx.fillStyle = WHITE
    ctx.font = '800 60px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(bubbles[i].value), bx + bW / 2, y + 73)
    ctx.fillStyle = MUTED
    ctx.font = '500 22px system-ui, sans-serif'
    ctx.fillText(bubbles[i].label, bx + bW / 2, y + 107)
  }
  ctx.textAlign = 'left'
  y += bH + 44

  // ── Body maps ──
  const mapH = 420
  const mapW = (W - PAD * 2 - 20) / 2
  let frontImg: HTMLImageElement | null = null
  let backImg: HTMLImageElement | null = null
  if (frontEl) { try { frontImg = await svgToImg(frontEl) } catch { /* skip */ } }
  if (backEl) { try { backImg = await svgToImg(backEl) } catch { /* skip */ } }
  if (frontImg) ctx.drawImage(frontImg, PAD, y, mapW, mapH)
  if (backImg) ctx.drawImage(backImg, PAD + mapW + 20, y, mapW, mapH)
  y += mapH + 44

  // ── Sessions ──
  sectionHeader('SESSIONS', y)
  y += 34
  const sortedSessions = [...weekSessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  ).slice(0, 5)
  const rowH = 52
  for (const s of sortedSessions) {
    // Row background
    ctx.fillStyle = SURFACE
    rrect(ctx, PAD, y, W - PAD * 2, rowH, 14)
    ctx.fill()
    // Orange dot
    ctx.fillStyle = PRIMARY
    ctx.beginPath()
    ctx.arc(PAD + 20, y + rowH / 2, 6, 0, Math.PI * 2)
    ctx.fill()
    // Day label
    ctx.fillStyle = MUTED
    ctx.font = '600 24px system-ui, sans-serif'
    const dayStr = fmtDay(s.startedAt)
    ctx.fillText(dayStr, PAD + 36, y + rowH / 2 + 9)
    const dayW = ctx.measureText(dayStr).width
    // Separator dot
    ctx.fillStyle = BORDER
    ctx.beginPath()
    ctx.arc(PAD + 36 + dayW + 14, y + rowH / 2, 3, 0, Math.PI * 2)
    ctx.fill()
    // Workout name
    ctx.fillStyle = WHITE
    ctx.font = '600 24px system-ui, sans-serif'
    const nameX = PAD + 36 + dayW + 30
    // Truncate name to fit
    const durStr = s.durationSeconds ? fmtDur(s.durationSeconds) : ''
    const durW = durStr ? ctx.measureText(durStr).width + 20 : 0
    const maxNameW = W - PAD - nameX - durW - PAD
    let name = s.workoutName
    while (name.length > 1 && ctx.measureText(name).width > maxNameW) name = name.slice(0, -1)
    if (name !== s.workoutName) name = name.slice(0, -1) + '…'
    ctx.fillText(name, nameX, y + rowH / 2 + 9)
    // Duration (right)
    if (durStr) {
      ctx.fillStyle = PRIMARY
      ctx.font = '700 24px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(durStr, W - PAD - 16, y + rowH / 2 + 9)
      ctx.textAlign = 'left'
    }
    y += rowH + 8
  }
  y += 36

  // ── Top Exercises ──
  const topEx = topExercises.slice(0, 4)
  if (topEx.length > 0) {
    sectionHeader('TOP EXERCISES', y)
    y += 34
    const trackW = W - PAD * 2
    const maxExSets = Math.max(...topEx.map(e => e.totalSets), 1)
    for (let i = 0; i < topEx.length; i++) {
      const ex = topEx[i]
      // Rank badge
      ctx.fillStyle = SURFACE2
      rrect(ctx, PAD, y - 2, 40, 36, 8)
      ctx.fill()
      ctx.fillStyle = PRIMARY
      ctx.font = '700 22px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), PAD + 20, y + 23)
      ctx.textAlign = 'left'
      // Name
      ctx.fillStyle = WHITE
      ctx.font = '600 26px system-ui, sans-serif'
      ctx.fillText(ex.name, PAD + 52, y + 22)
      // Meta (sets + max weight) right
      const metaParts: string[] = []
      metaParts.push(`${ex.totalSets} sets`)
      if (ex.maxWeightKg != null) metaParts.push(`max ${ex.maxWeightKg} kg`)
      ctx.fillStyle = MUTED
      ctx.font = '500 22px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(metaParts.join(' · '), W - PAD, y + 22)
      ctx.textAlign = 'left'
      y += 18
      // Progress bar
      ctx.fillStyle = SURFACE2
      rrect(ctx, PAD, y, trackW, 10, 5)
      ctx.fill()
      ctx.fillStyle = PRIMARY
      rrect(ctx, PAD, y, Math.round((ex.totalSets / maxExSets) * trackW), 10, 5)
      ctx.fill()
      y += 52
    }
    y += 24
  }

  // ── Top Muscles ──
  const topMuscles = [...weekData.muscles].sort((a, b) => b.sets - a.sets).slice(0, 4)
  if (topMuscles.length > 0) {
    const trackW = W - PAD * 2
    sectionHeader('TOP MUSCLES', y)
    y += 34
    const maxSets = Math.max(...topMuscles.map(m => m.sets), 1)
    for (const { muscle, sets } of topMuscles) {
      const color = SHARE_MUSCLE_COLORS[muscle] ?? PRIMARY
      const label = SHARE_MUSCLE_LABELS[muscle] ?? muscle
      ctx.fillStyle = WHITE
      ctx.font = '600 26px system-ui, sans-serif'
      ctx.fillText(label, PAD, y)
      ctx.fillStyle = MUTED
      ctx.font = '500 24px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`${sets} sets`, W - PAD, y)
      ctx.textAlign = 'left'
      y += 14
      ctx.fillStyle = SURFACE2
      rrect(ctx, PAD, y, trackW, 12, 6)
      ctx.fill()
      ctx.fillStyle = color
      rrect(ctx, PAD, y, Math.round((sets / maxSets) * trackW), 12, 6)
      ctx.fill()
      y += 52
    }
  }

  // ── Footer ──
  const footerY = H - 72
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(PAD, footerY)
  ctx.lineTo(W - PAD, footerY)
  ctx.stroke()
  ctx.fillStyle = MUTED
  ctx.font = '400 24px system-ui, sans-serif'
  ctx.fillText('#training #fitness #workout', PAD, footerY + 34)
  ctx.font = '700 24px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('fitapp', W - PAD - 22, footerY + 34)
  ctx.fillStyle = PRIMARY
  ctx.beginPath()
  ctx.arc(W - PAD - 8, footerY + 23, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('toBlob failed'))
    }, 'image/png')
  })
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
  const [weekInsights, setWeekInsights] = useState<SessionInsights | null>(null)
  const [exerciseRecords, setExerciseRecords] = useState<ExerciseRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Week coverage state
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekData, setWeekData] = useState<WeekMuscleCoverage | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)
  const [mapSide, setMapSide] = useState<'front' | 'back'>('front')
  const [muscleFilter, setMuscleFilter] = useState<'week' | 'month'>('week')
  const [minutesFilter, setMinutesFilter] = useState<'week' | 'month'>('week')
  const [donutFilter, setDonutFilter] = useState<'week' | 'month'>('week')
  const [exerciseFilter, setExerciseFilter] = useState<'week' | 'month'>('week')

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
    Promise.allSettled([getMyStats(), getMySessions(1, 20), getMyInsights(30), getMyInsights(7), getExerciseRecords()])
      .then(([s, sess, ins, wIns, recs]) => {
        if (s.status === 'fulfilled') setStats(s.value)
        if (sess.status === 'fulfilled') setSessions(sess.value.data)
        if (ins.status === 'fulfilled') setInsights(ins.value)
        if (wIns.status === 'fulfilled') setWeekInsights(wIns.value)
        if (recs.status === 'fulfilled') setExerciseRecords(recs.value.data)
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

  // ── Report download ────────────────────────────────────────────────────────

  const [isDownloading, setIsDownloading] = useState(false)

  // ── Share weekly progress ──────────────────────────────────────────────────

  const frontMapRef = useRef<HTMLDivElement>(null)
  const backMapRef = useRef<HTMLDivElement>(null)
  const [isSharing, setIsSharing] = useState(false)

  async function handleDownloadReport() {
    if (!weekData || isDownloading) return
    setIsDownloading(true)
    try {
      const start = new Date(weekData.weekStart + 'T00:00:00')
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      end.setHours(23, 59, 59)
      const weekSessions = sessions.filter(s => {
        const d = new Date(s.startedAt)
        return d >= start && d <= end
      })
      const detailed = await Promise.all(weekSessions.map(s => getSession(s.id)))
      downloadMarkdown(
        weeklyReportToMarkdown(detailed, weekData.weekStart),
        `weekly-report-${weekData.weekStart}.md`,
      )
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleShare() {
    if (!weekData || isSharing) return
    setIsSharing(true)
    try {
      const blob = await buildShareImage(weekData, weekSessions, weekTotalSets, weekInsights?.topExercises ?? [], frontMapRef.current, backMapRef.current)
      const file = new File([blob], `fitapp-week-${weekData.weekStart}.png`, { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Weekly Training Progress' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch { /* user cancelled or error */ }
    finally { setIsSharing(false) }
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

  const muscleDisplayData = muscleFilter === 'week'
    ? [...(weekData?.muscles ?? [])].sort((a, b) => b.sets - a.sets)
    : (insights?.topMuscles ?? [])
  const maxMuscleSets = Math.max(...muscleDisplayData.map(m => m.sets), 1)

  // ── Share card data ────────────────────────────────────────────────────────

  const weekSessions = sessions.filter(s => {
    if (!weekData) return false
    const d = new Date(s.startedAt)
    const start = new Date(weekData.weekStart + 'T00:00:00')
    const end = new Date(weekData.weekEnd + 'T23:59:59')
    return d >= start && d <= end
  })
  const weekTotalSets = weekData ? weekData.muscles.reduce((sum, m) => sum + m.sets, 0) : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="phone-shell">
      <AppHeader title="Progress" />

      {/* Off-screen body maps for canvas share image */}
      <div style={{ position: 'fixed', left: -9999, top: 0, width: 300, height: 400, pointerEvents: 'none', opacity: 0 }}>
        <div ref={frontMapRef} style={{ width: 300, height: 400 }}>
          <BodyMapFront muscles={weekData?.muscles ?? []} />
        </div>
      </div>
      <div style={{ position: 'fixed', left: -9999, top: 0, width: 300, height: 400, pointerEvents: 'none', opacity: 0 }}>
        <div ref={backMapRef} style={{ width: 300, height: 400 }}>
          <BodyMapBack muscles={weekData?.muscles ?? []} />
        </div>
      </div>

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
            {/* Loading bar */}
            {(isLoading || weekLoading) && (
              <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 12 }}>
                <div className="loading-bar-anim" style={{ height: '100%', background: 'var(--primary)', width: '30%', borderRadius: 2 }} />
              </div>
            )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}
                    disabled={weekOffset >= 0}
                    style={{ background: 'none', border: 'none', padding: 4, cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer', color: weekOffset >= 0 ? 'var(--border)' : 'var(--text-muted)', display: 'flex', opacity: weekOffset >= 0 ? 0.3 : 1 }}
                  >
                    <ChevronRight size={18} />
                  </button>
                  {weekData && (
                    <button
                      onClick={() => void handleDownloadReport()}
                      disabled={isDownloading}
                      aria-label="Download weekly report as markdown"
                      style={{ background: 'none', border: 'none', padding: 4, cursor: isDownloading ? 'wait' : 'pointer', color: isDownloading ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', opacity: isDownloading ? 0.6 : 1 }}
                    >
                      <Download size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Front / Back toggle */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['front', 'back'] as const).map(side => (
                  <button
                    key={side}
                    onClick={() => setMapSide(side)}
                    style={{
                      flex: 1, padding: '5px 0',
                      borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      background: mapSide === side ? 'var(--primary)' : 'var(--surface-2)',
                      color: mapSide === side ? '#fff' : 'var(--text-muted)',
                      transition: 'background 0.15s, color 0.15s',
                      textTransform: 'capitalize',
                    }}
                  >
                    {side}
                  </button>
                ))}
              </div>

              {weekLoading ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</div>
              ) : (
                <div style={{ maxWidth: 240, margin: '0 auto' }}>
                  {mapSide === 'front'
                    ? <BodyMapFront muscles={weekData?.muscles ?? []} />
                    : <BodyMapBack muscles={weekData?.muscles ?? []} />
                  }
                </div>
              )}

              {!weekLoading && weekData && weekData.muscles.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                  No sessions this week.
                </div>
              )}
            </div>

            {/* Share button */}
            {!weekLoading && weekData && (
              <button
                onClick={() => void handleShare()}
                disabled={isSharing}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '12px 0',
                  marginBottom: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, cursor: isSharing ? 'wait' : 'pointer',
                  fontSize: 14, fontWeight: 700, color: isSharing ? 'var(--primary)' : 'var(--text)',
                  opacity: isSharing ? 0.7 : 1,
                }}
              >
                <Share2 size={16} color={isSharing ? 'var(--primary)' : '#FF6B35'} />
                {isSharing ? 'Generating...' : 'Share progress'}
              </button>
            )}

            {/* Week insight */}
            {!weekLoading && weekData && <WeekInsightCard muscles={weekData.muscles} />}

            {/* Minutes trained */}
            {(() => {
              const todayIdx = weekOffset === 0 ? (new Date().getDay() + 6) % 7 : -1
              const { minutes: wkMins, labels: wkLabels } = getWeeklyMinutes(sessions)
              const dayMins = getDayMinutes(sessions, weekOffset)
              const barData = minutesFilter === 'week' ? dayMins : wkMins
              const barLabels = minutesFilter === 'week' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : wkLabels
              const total = barData.reduce((s, v) => s + v, 0)
              return (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="section-header" style={{ marginBottom: 12 }}>
                    <span className="section-title">Minutes Trained</span>
                    {total > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} min total</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {(['week', 'month'] as const).map(f => (
                      <button key={f} onClick={() => setMinutesFilter(f)} style={{
                        flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700,
                        background: minutesFilter === f ? 'var(--primary)' : 'var(--surface-2)',
                        color: minutesFilter === f ? '#fff' : 'var(--text-muted)',
                        transition: 'background 0.15s, color 0.15s',
                      }}>
                        {f === 'week' ? 'This Week' : 'Last 30 days'}
                      </button>
                    ))}
                  </div>
                  <DayBarsChart
                    data={barData}
                    labels={barLabels}
                    highlightIdx={minutesFilter === 'week' ? todayIdx : 3}
                  />
                </div>
              )
            })()}

            {/* Muscle distribution donut */}
            {!isLoading && (weekData || insights) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <span className="section-title">Muscle Distribution</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['week', 'month'] as const).map(f => (
                    <button key={f} onClick={() => setDonutFilter(f)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      background: donutFilter === f ? 'var(--primary)' : 'var(--surface-2)',
                      color: donutFilter === f ? '#fff' : 'var(--text-muted)',
                      transition: 'background 0.15s, color 0.15s',
                    }}>
                      {f === 'week' ? 'This Week' : 'Last 30 days'}
                    </button>
                  ))}
                </div>
                <WorkoutTypeDonut muscles={donutFilter === 'week' ? (weekData?.muscles ?? []) : (insights?.topMuscles ?? [])} />
              </div>
            )}

            {/* Top muscles — filterable */}
            {muscleDisplayData.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <span className="section-title">Muscles Trained</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['week', 'month'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setMuscleFilter(f)}
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700,
                        background: muscleFilter === f ? 'var(--primary)' : 'var(--surface-2)',
                        color: muscleFilter === f ? '#fff' : 'var(--text-muted)',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {f === 'week' ? 'This Week' : 'Last 30 days'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {muscleDisplayData.map((m) => {
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
            {!isLoading && insights && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <span className="section-title">Top Exercises</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['week', 'month'] as const).map(f => (
                    <button key={f} onClick={() => setExerciseFilter(f)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      background: exerciseFilter === f ? 'var(--primary)' : 'var(--surface-2)',
                      color: exerciseFilter === f ? '#fff' : 'var(--text-muted)',
                      transition: 'background 0.15s, color 0.15s',
                    }}>
                      {f === 'week' ? 'This Week' : 'Last 30 days'}
                    </button>
                  ))}
                </div>
                {(() => {
                  const exList = exerciseFilter === 'week'
                    ? (weekInsights?.topExercises ?? [])
                    : (insights.topExercises ?? [])
                  if (exList.length === 0) return (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                      No sessions this week.
                    </div>
                  )
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {exList.map((ex, i) => (
                        <div key={ex.exerciseId} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                          borderBottom: i < exList.length - 1 ? '1px solid var(--border)' : 'none',
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
                  )
                })()}
              </div>
            )}

            {/* Top exercises PRs */}
            {exerciseRecords.length > 0 && (
              <>
                <div className="section-header">
                  <span className="section-title">Top Exercises</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {exerciseRecords.map((rec) => (
                    <div key={rec.exerciseId} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 14, padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rec.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {rec.sessionCount} {rec.sessionCount === 1 ? 'session' : 'sessions'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {rec.maxWeightKg != null && (
                          <div style={{ textAlign: 'center', background: 'var(--surface-2)', borderRadius: 10, padding: '6px 10px', minWidth: 52 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                              {rec.maxWeightKg}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>kg PR</div>
                          </div>
                        )}
                        {rec.maxRepsInSet != null && (
                          <div style={{ textAlign: 'center', background: 'var(--surface-2)', borderRadius: 10, padding: '6px 10px', minWidth: 52 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#30D158', lineHeight: 1 }}>
                              {rec.maxRepsInSet}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>reps PR</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
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
