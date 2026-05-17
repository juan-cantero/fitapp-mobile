import { forwardRef } from 'react'
import { BodyMapFront, BodyMapBack } from './BodyMap'
import type { WeekMuscleCoverage, Session } from '../lib/api'

// ── Carbon palette (hardcoded — CSS variables don't work in html-to-image) ───

const C = {
  bg: '#0f0f0f',
  surface: '#1a1a1a',
  surface2: '#252525',
  primary: '#FF6B35',
  white: '#ffffff',
  muted: '#888888',
  border: '#2a2a2a',
  green: '#30D158',
} as const

// Muscle label map
const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', core: 'Core', adductors: 'Adductors', abductors: 'Abductors',
}

// Muscle bar colors (same palette as ProgressPage)
const MUSCLE_COLORS: Record<string, string> = {
  chest: '#FF6B35', back: '#5AC8FA', shoulders: '#FFB830',
  biceps: '#30D158', triceps: '#BF5AF2', quads: '#FF6B35',
  hamstrings: '#5AC8FA', glutes: '#FFB830', core: '#30D158',
  calves: '#BF5AF2', forearms: '#FF9500', adductors: '#64D2FF', abductors: '#FFD60A',
}

// Day labels Mon–Sun
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeeklyShareCardProps {
  weekData: WeekMuscleCoverage
  weekSessions: Session[]
  totalSets: number
}

// ── Helper: ISO date → day index (0 = Mon … 6 = Sun) ─────────────────────────

function dayIndex(isoString: string): number {
  const d = new Date(isoString)
  // getDay() returns 0=Sun, 1=Mon … 6=Sat; we want 0=Mon … 6=Sun
  return (d.getDay() + 6) % 7
}

// ── Component ─────────────────────────────────────────────────────────────────

export const WeeklyShareCard = forwardRef<HTMLDivElement, WeeklyShareCardProps>(
  function WeeklyShareCard({ weekData, weekSessions, totalSets }, ref) {
    // ── Day bars data ──────────────────────────────────────────────────────────

    // Build per-day duration in seconds (0 if no session)
    const dayDurations: number[] = Array(7).fill(0)
    for (const s of weekSessions) {
      const idx = dayIndex(s.startedAt)
      dayDurations[idx] = (dayDurations[idx] ?? 0) + (s.durationSeconds ?? 1800)
    }
    const maxDuration = Math.max(...dayDurations, 1)

    // ── Top 5 muscles ─────────────────────────────────────────────────────────

    const topMuscles = [...weekData.muscles]
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 5)
    const maxSets = Math.max(...topMuscles.map(m => m.sets), 1)

    // ── Week range label ──────────────────────────────────────────────────────

    function fmt(iso: string): string {
      const d = new Date(iso + 'T00:00:00')
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    const weekLabel = `${fmt(weekData.weekStart)} – ${fmt(weekData.weekEnd)}`

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          width: 540,
          height: 960,
          overflow: 'hidden',
          background: C.bg,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: C.white,
          boxSizing: 'border-box',
          padding: '28px 28px 24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* ── Header row ───────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: C.primary,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 2,
              color: C.white,
              textTransform: 'uppercase',
            }}>
              FITAPP
            </span>
          </div>
          {/* Week label */}
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.muted,
            letterSpacing: 0.3,
          }}>
            {weekLabel}
          </span>
        </div>

        {/* ── Stats bubbles ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          gap: 12,
          flexShrink: 0,
        }}>
          {[
            { value: weekData.totalSessions, label: 'sessions' },
            { value: weekData.muscles.length, label: 'muscles' },
            { value: totalSets, label: 'sets' },
          ].map(({ value, label }) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: C.surface,
                borderRadius: 16,
                border: `1px solid ${C.border}`,
                padding: '14px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{
                fontSize: 30,
                fontWeight: 800,
                color: C.white,
                lineHeight: 1,
              }}>
                {value}
              </span>
              <span style={{
                fontSize: 11,
                color: C.muted,
                fontWeight: 500,
                textTransform: 'lowercase',
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Body maps ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          gap: 12,
          flexShrink: 0,
          height: 240,
        }}>
          <div style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
              <BodyMapFront muscles={weekData.muscles} />
            </div>
          </div>
          <div style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
              <BodyMapBack muscles={weekData.muscles} />
            </div>
          </div>
        </div>

        {/* ── Day bars section ──────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0 }}>
          {/* Section label */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              This Week
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Bars */}
          <div style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            height: 72,
          }}>
            {DAY_LABELS.map((label, i) => {
              const duration = dayDurations[i] ?? 0
              const hasSession = duration > 0
              const barHeightPct = hasSession ? Math.max(duration / maxDuration, 0.15) : 0.06
              const barHeight = Math.round(barHeightPct * 60)

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    justifyContent: 'flex-end',
                  }}
                >
                  <div style={{
                    width: '100%',
                    height: barHeight,
                    borderRadius: 6,
                    background: hasSession ? C.primary : C.surface2,
                    opacity: hasSession ? 1 : 0.5,
                  }} />
                  <span style={{
                    fontSize: 11,
                    color: hasSession ? C.white : C.muted,
                    fontWeight: hasSession ? 700 : 400,
                  }}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Top muscles ───────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {/* Section label */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              Top Muscles
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Muscle rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topMuscles.length === 0 ? (
              <span style={{ fontSize: 13, color: C.muted }}>No sessions recorded this week.</span>
            ) : (
              topMuscles.map(({ muscle, sets }) => {
                const barWidth = Math.round((sets / maxSets) * 100)
                const color = MUSCLE_COLORS[muscle] ?? C.primary
                const label = MUSCLE_LABELS[muscle] ?? muscle

                return (
                  <div key={muscle} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Name + sets */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 12, color: C.muted }}>
                        {sets} sets
                      </span>
                    </div>
                    {/* Bar track */}
                    <div style={{
                      width: '100%',
                      height: 6,
                      borderRadius: 3,
                      background: C.surface2,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: color,
                      }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          paddingTop: 8,
          borderTop: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 11, color: C.muted }}>
            #training #fitness #workout
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1 }}>
              fitapp
            </span>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: C.primary,
            }} />
          </div>
        </div>
      </div>
    )
  },
)
