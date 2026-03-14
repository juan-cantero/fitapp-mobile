import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { getSession } from '../../lib/api'
import type { Session, SessionSet } from '../../lib/api'

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.round(seconds / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m} min`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function groupByExercise(sets: SessionSet[]): { exerciseId: string; name: string; sets: SessionSet[] }[] {
  const map = new Map<string, { exerciseId: string; name: string; sets: SessionSet[] }>()
  for (const s of sets) {
    if (!map.has(s.exerciseId)) {
      map.set(s.exerciseId, { exerciseId: s.exerciseId, name: s.exerciseName, sets: [] })
    }
    map.get(s.exerciseId)!.sets.push(s)
  }
  return Array.from(map.values())
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getSession(id)
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load session'))
      .finally(() => setIsLoading(false))
  }, [id])

  const exercises = session?.sets ? groupByExercise(session.sets) : []

  // Total volume for this session
  const totalVolumeKg = (session?.sets ?? []).reduce((sum, s) => {
    return sum + (s.repsDone ?? 0) * (s.weightKg ?? 0)
  }, 0)

  return (
    <div className="phone-shell">
      <header className="app-header" style={{ position: 'relative' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 14, padding: 0,
          }}
        >
          <ChevronLeft size={18} />
          Back
        </button>
        <span className="header-title">Session</span>
      </header>

      <div className="content">
        {isLoading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            Loading...
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            {error}
          </div>
        )}

        {session && (
          <>
            {/* Header card */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                {session.workoutName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                {formatDate(session.startedAt)}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                    {formatDuration(session.durationSeconds)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Duration</div>
                </div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                    {session.sets?.length ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Sets</div>
                </div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                    {totalVolumeKg > 0 ? `${Math.round(totalVolumeKg)}kg` : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Volume</div>
                </div>
              </div>
            </div>

            {/* Exercises */}
            {exercises.length === 0 ? (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '24px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sets logged for this session.</div>
              </div>
            ) : (
              <>
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <span className="section-title">Exercises</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{exercises.length} exercises</span>
                </div>

                {exercises.map((ex) => {
                  const exVolume = ex.sets.reduce((sum, s) => sum + (s.repsDone ?? 0) * (s.weightKg ?? 0), 0)
                  return (
                    <div key={ex.exerciseId} className="card" style={{ marginBottom: 12 }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        marginBottom: 12,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                          {ex.name}
                        </div>
                        {exVolume > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                            {Math.round(exVolume)} kg
                          </div>
                        )}
                      </div>

                      {/* Set rows */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* Header */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '28px 1fr 1fr',
                          fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          paddingBottom: 4, borderBottom: '1px solid var(--border)',
                        }}>
                          <span>Set</span>
                          <span>Reps</span>
                          <span>Weight</span>
                        </div>

                        {ex.sets.map((s) => (
                          <div key={s.id} style={{
                            display: 'grid', gridTemplateColumns: '28px 1fr 1fr',
                            fontSize: 14, color: 'var(--text)', alignItems: 'center',
                            padding: '3px 0',
                          }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.setNumber}</span>
                            <span style={{ fontWeight: 600 }}>
                              {s.repsDone != null ? `${s.repsDone}` : '—'}
                            </span>
                            <span style={{ color: s.weightKg ? 'var(--text)' : 'var(--text-muted)' }}>
                              {s.weightKg != null ? `${s.weightKg} kg` : 'BW'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
