import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Camera, Sparkles, ChevronDown, ChevronUp, Download, Target } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { BottomNav } from '../../components/BottomNav'
import { getUser, clearAuth } from '../../lib/auth'
import {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  addMeasurement,
  getMeasurementHistory,
  generateHealthMessage,
  getHealthReports,
  getGoals,
  saveGoals,
} from '../../lib/api'
import type { UserProfile, BodyMeasurement, HealthReport, UserGoals } from '../../types/profile'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function calculateBmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100
  return Math.round((weightKg / (h * h)) * 10) / 10
}

function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Bajo peso', color: '#60a5fa' }
  if (bmi < 25) return { label: 'Normal', color: '#34d399' }
  if (bmi < 30) return { label: 'Sobrepeso', color: '#fb923c' }
  return { label: 'Obesidad', color: '#f87171' }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

const GAUGE_START = 150
const BMI_MIN = 10
const BMI_MAX = 40

function bmiToAngle(bmi: number): number {
  const pct = Math.min(1, Math.max(0, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)))
  return GAUGE_START + pct * 240
}

function BmiGauge({ bmi }: { bmi: number }) {
  const cx = 100
  const cy = 100
  const r = 72
  const { label, color } = bmiCategory(bmi)
  const zones = [
    { from: BMI_MIN, to: 18.5, color: '#60a5fa' },
    { from: 18.5, to: 25, color: '#34d399' },
    { from: 25, to: 30, color: '#fb923c' },
    { from: 30, to: BMI_MAX, color: '#f87171' },
  ]
  const needleAngle = bmiToAngle(bmi)
  const needle = polarToCartesian(cx, cy, r - 10, needleAngle)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={200} height={140} viewBox="0 0 200 140" aria-label={`BMI gauge: ${bmi}`}>
        {zones.map((z) => (
          <path
            key={z.from}
            d={describeArc(cx, cy, r, GAUGE_START + ((z.from - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 240, GAUGE_START + ((z.to - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 240)}
            fill="none" stroke={z.color} strokeWidth={14} strokeLinecap="butt" opacity={0.85}
          />
        ))}
        <circle cx={needle.x} cy={needle.y} r={6} fill={color} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#F5F5F5" fontSize={28} fontWeight={700}>{bmi}</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill={color} fontSize={12} fontWeight={600}>{label}</text>
      </svg>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function GoalProgressBar({ current, goal }: { current: number; goal: number }) {
  const pct = Math.min(100, Math.round((Math.min(current, goal) / Math.max(current, goal)) * 100))
  const achieved = Math.abs(current - goal) / goal <= 0.03
  const color = achieved ? '#34d399' : pct >= 80 ? '#FF6B35' : '#888888'
  return (
    <div style={{ height: 4, background: '#2e2e2e', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export function ProfilePage() {
  const navigate = useNavigate()
  const user = getUser()
  const name = user?.name ?? 'Athlete'
  const email = user?.email ?? ''

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [latestMeasurement, setLatestMeasurement] = useState<BodyMeasurement | null>(null)
  const [history, setHistory] = useState<BodyMeasurement[]>([])
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [reports, setReports] = useState<HealthReport[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historySortAsc, setHistorySortAsc] = useState(false)
  const [goals, setGoals] = useState<UserGoals | null>(null)
  const [editingMeasures, setEditingMeasures] = useState(false)
  const [showGoalsForm, setShowGoalsForm] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState(false)
  const [savingMeasure, setSavingMeasure] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Measurement form
  const [weightKg, setWeightKg] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [waistCm, setWaistCm] = useState('')
  const [armCm, setArmCm] = useState('')
  const [legsCm, setLegsCm] = useState('')
  const [glutesCm, setGlutesCm] = useState('')

  // Goals form
  const [goalWeight, setGoalWeight] = useState('')
  const [goalWaist, setGoalWaist] = useState('')
  const [goalArm, setGoalArm] = useState('')
  const [goalLegs, setGoalLegs] = useState('')
  const [goalGlutes, setGoalGlutes] = useState('')
  const [goalText, setGoalText] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    getMyProfile()
      .then(({ profile: p, latestMeasurement: m }) => {
        setProfile(p)
        setLatestMeasurement(m)
        if (p.heightCm) setHeightCm(String(p.heightCm))
        if (m?.weightKg) setWeightKg(String(m.weightKg))
        if (m?.waistCm) setWaistCm(String(m.waistCm))
        if (m?.armCm) setArmCm(String(m.armCm))
        if (m?.legsCm) setLegsCm(String(m.legsCm))
        if (m?.glutesCm) setGlutesCm(String(m.glutesCm))
      })
      .catch(() => {})

    getMeasurementHistory()
      .then(({ data }) => setHistory(data))
      .catch(() => {})

    getHealthReports()
      .then(({ data }) => setReports(data))
      .catch(() => {})

    getGoals()
      .then(({ goals: g }) => {
        setGoals(g)
        if (g) {
          if (g.weightKg) setGoalWeight(String(g.weightKg))
          if (g.waistCm) setGoalWaist(String(g.waistCm))
          if (g.armCm) setGoalArm(String(g.armCm))
          if (g.legsCm) setGoalLegs(String(g.legsCm))
          if (g.glutesCm) setGoalGlutes(String(g.glutesCm))
          if (g.goalText) setGoalText(g.goalText)
        }
      })
      .catch(() => {})
  }, [])

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setError(null)
    try {
      const updated = await uploadAvatar(file)
      setProfile(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveMeasurements() {
    setError(null)
    const weight = weightKg ? parseFloat(weightKg) : undefined
    const height = heightCm ? parseFloat(heightCm) : undefined
    setSavingMeasure(true)
    try {
      if (height && height !== profile?.heightCm) {
        const updated = await updateMyProfile({ heightCm: height })
        setProfile(updated)
      }
      if (weight || waistCm || armCm || legsCm || glutesCm) {
        const m = await addMeasurement({
          weightKg: weight,
          waistCm: waistCm ? parseFloat(waistCm) : undefined,
          armCm: armCm ? parseFloat(armCm) : undefined,
          legsCm: legsCm ? parseFloat(legsCm) : undefined,
          glutesCm: glutesCm ? parseFloat(glutesCm) : undefined,
        })
        setLatestMeasurement(m)
        setHistory((prev) => [m, ...prev])
        setEditingMeasures(false)
        if (m.weightKg) setWeightKg(String(m.weightKg))
        if (m.waistCm) setWaistCm(String(m.waistCm))
        if (m.armCm) setArmCm(String(m.armCm))
        if (m.legsCm) setLegsCm(String(m.legsCm))
        if (m.glutesCm) setGlutesCm(String(m.glutesCm))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingMeasure(false)
    }
  }

  async function handleSaveGoals() {
    setSavingGoals(true)
    setError(null)
    try {
      const { goals: saved } = await saveGoals({
        weightKg: goalWeight ? parseFloat(goalWeight) : null,
        waistCm: goalWaist ? parseFloat(goalWaist) : null,
        armCm: goalArm ? parseFloat(goalArm) : null,
        legsCm: goalLegs ? parseFloat(goalLegs) : null,
        glutesCm: goalGlutes ? parseFloat(goalGlutes) : null,
        goalText: goalText.trim() || null,
      })
      setGoals(saved)
      setShowGoalsForm(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingGoals(false)
    }
  }

  async function handleGenerateMessage() {
    const weight = weightKg ? parseFloat(weightKg) : latestMeasurement?.weightKg ?? null
    const height = heightCm ? parseFloat(heightCm) : profile?.heightCm ?? null
    if (!weight || !height) return
    setLoadingMessage(true)
    setError(null)
    try {
      const { report } = await generateHealthMessage({
        weightKg: weight,
        heightCm: height,
        waistCm: waistCm ? parseFloat(waistCm) : latestMeasurement?.waistCm ?? undefined,
        armCm: armCm ? parseFloat(armCm) : latestMeasurement?.armCm ?? undefined,
        legsCm: legsCm ? parseFloat(legsCm) : latestMeasurement?.legsCm ?? undefined,
        glutesCm: glutesCm ? parseFloat(glutesCm) : latestMeasurement?.glutesCm ?? undefined,
        goalText: goals?.goalText ?? undefined,
      })
      setReports((prev) => [report, ...prev])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingMessage(false)
    }
  }

  const effectiveWeight = weightKg ? parseFloat(weightKg) : latestMeasurement?.weightKg ?? null
  const effectiveHeight = heightCm ? parseFloat(heightCm) : profile?.heightCm ?? null
  const bmi = effectiveWeight && effectiveHeight ? calculateBmi(effectiveWeight, effectiveHeight) : null

  const visibleHistory = showAllHistory ? history : history.slice(0, 5)

  const weightHistory = [...history]
    .filter((m) => m.weightKg !== null)
    .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime())
    .slice(-15)
    .map((m) => ({
      date: new Date(m.measuredAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      weight: m.weightKg as number,
    }))

  const goalProgressItems = [
    { label: 'Peso', current: effectiveWeight, goal: goals?.weightKg ?? null, unit: 'kg' },
    { label: 'Cintura', current: latestMeasurement?.waistCm ?? null, goal: goals?.waistCm ?? null, unit: 'cm' },
    { label: 'Brazo', current: latestMeasurement?.armCm ?? null, goal: goals?.armCm ?? null, unit: 'cm' },
    { label: 'Piernas', current: latestMeasurement?.legsCm ?? null, goal: goals?.legsCm ?? null, unit: 'cm' },
    { label: 'Cola', current: latestMeasurement?.glutesCm ?? null, goal: goals?.glutesCm ?? null, unit: 'cm' },
  ].filter((item) => item.goal !== null && item.current !== null) as { label: string; current: number; goal: number; unit: string }[]

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 14,
    boxSizing: 'border-box',
  }

  return (
    <div className="phone-shell">
      <header className="app-header">
        <span className="header-title">Perfil</span>
      </header>

      <div className="content" style={{ paddingBottom: 24 }}>
        {error && (
          <div style={{ background: '#ff4444', color: '#fff', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Avatar + user info */}
        <div className="profile-user-card" style={{ position: 'relative' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
            ) : (
              <div className="profile-avatar">{getInitials(name)}</div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
              aria-label="Cambiar avatar"
            >
              <Camera size={12} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">{name}</div>
            <div className="profile-meta">{email}</div>
            {user?.role && (
              <span className={`pill ${user.role === 'admin' ? 'pill-primary' : 'pill-muted'}`} style={{ marginTop: 6 }}>
                {user.role}
              </span>
            )}
          </div>
        </div>

        {/* BMI gauge */}
        {bmi && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, alignSelf: 'flex-start' }}>IMC</div>
            <BmiGauge bmi={bmi} />
          </div>
        )}

        {/* Weight evolution chart */}
        {weightHistory.length >= 2 && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
              Evolución del peso
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={weightHistory} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#888888' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#888888' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#1C1C1C', border: '1px solid #2e2e2e', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#888888' }}
                  itemStyle={{ color: '#FF6B35' }}
                  formatter={(v) => [v != null ? `${v} kg` : '', 'Peso']}
                />
                <Line type="monotone" dataKey="weight" stroke="#FF6B35" strokeWidth={2} dot={{ r: 3, fill: '#FF6B35' }} activeDot={{ r: 5 }} />
                {goals?.weightKg && (
                  <ReferenceLine
                    y={goals.weightKg}
                    stroke="#34d399"
                    strokeDasharray="5 4"
                    label={{ value: `Meta ${goals.weightKg}kg`, position: 'insideTopRight', fontSize: 9, fill: '#34d399' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Measurements card */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Medidas</div>
            <button
              onClick={() => setEditingMeasures((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: '2px 6px' }}
            >
              {editingMeasures ? 'Cancelar' : latestMeasurement ? 'Editar' : 'Agregar'}
            </button>
          </div>

          {!editingMeasures && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Peso', value: latestMeasurement?.weightKg, unit: 'kg' },
                { label: 'Altura', value: profile?.heightCm, unit: 'cm' },
                { label: 'Cintura', value: latestMeasurement?.waistCm, unit: 'cm' },
                { label: 'Brazo', value: latestMeasurement?.armCm, unit: 'cm' },
                { label: 'Piernas', value: latestMeasurement?.legsCm, unit: 'cm' },
                { label: 'Cola', value: latestMeasurement?.glutesCm, unit: 'cm' },
              ].map(({ label, value, unit }) => (
                <div key={label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: value != null ? 'var(--text)' : 'var(--text-muted)' }}>
                    {value != null ? `${value}` : '—'}
                  </div>
                  {value != null && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{unit}</div>}
                </div>
              ))}
            </div>
          )}

          {editingMeasures && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Peso (kg)', value: weightKg, set: setWeightKg, placeholder: '70' },
                  { label: 'Altura (cm)', value: heightCm, set: setHeightCm, placeholder: '175' },
                  { label: 'Cintura (cm)', value: waistCm, set: setWaistCm, placeholder: '80' },
                  { label: 'Brazo (cm)', value: armCm, set: setArmCm, placeholder: '35' },
                  { label: 'Piernas (cm)', value: legsCm, set: setLegsCm, placeholder: '55' },
                  { label: 'Cola (cm)', value: glutesCm, set: setGlutesCm, placeholder: '95' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type="number" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} style={inputStyle} />
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={handleSaveMeasurements} disabled={savingMeasure} style={{ width: '100%', marginTop: 14 }}>
                {savingMeasure ? 'Guardando...' : 'Guardar medidas'}
              </button>
            </>
          )}
        </div>

        {/* Goals */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
              <Target size={13} />
              Metas
            </div>
            <button
              onClick={() => setShowGoalsForm((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: '2px 6px' }}
            >
              {showGoalsForm ? 'Cancelar' : goals ? 'Editar' : 'Definir metas'}
            </button>
          </div>

          {/* Goal text display */}
          {!showGoalsForm && goals?.goalText && (
            <p style={{ fontSize: 13, color: 'var(--text)', fontStyle: 'italic', margin: '0 0 12px', lineHeight: 1.5, borderLeft: '2px solid var(--primary)', paddingLeft: 10 }}>
              {goals.goalText}
            </p>
          )}

          {/* Progress display */}
          {!showGoalsForm && goalProgressItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {goalProgressItems.map(({ label, current, goal, unit }) => {
                const diff = Math.round((current - goal) * 10) / 10
                const achieved = Math.abs(diff) / goal <= 0.03
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ color: achieved ? '#34d399' : 'var(--text)' }}>
                        {current}{unit} → {goal}{unit}
                        {achieved
                          ? ' ✓'
                          : ` (${diff > 0 ? '+' : ''}${diff}${unit})`}
                      </span>
                    </div>
                    <GoalProgressBar current={current} goal={goal} />
                  </div>
                )
              })}
            </div>
          )}

          {!showGoalsForm && !goals && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
              Define tus metas para ver tu progreso.
            </p>
          )}

          {/* Goals edit form */}
          {showGoalsForm && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Mi meta (texto libre)</label>
                <textarea
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="Ej: quiero estar atlético y poder levantar 50 kg en peso muerto"
                  rows={3}
                  maxLength={500}
                  style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Peso meta (kg)', value: goalWeight, set: setGoalWeight, placeholder: '72' },
                  { label: 'Cintura meta (cm)', value: goalWaist, set: setGoalWaist, placeholder: '75' },
                  { label: 'Brazo meta (cm)', value: goalArm, set: setGoalArm, placeholder: '38' },
                  { label: 'Piernas meta (cm)', value: goalLegs, set: setGoalLegs, placeholder: '58' },
                  { label: 'Cola meta (cm)', value: goalGlutes, set: setGoalGlutes, placeholder: '98' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type="number" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} style={inputStyle} />
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={handleSaveGoals} disabled={savingGoals} style={{ width: '100%', marginTop: 14 }}>
                {savingGoals ? 'Guardando...' : 'Guardar metas'}
              </button>
            </>
          )}
        </div>

        {/* Measurement history */}
        {history.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Historial</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleHistory.map((m) => {
                const entryBmi = m.weightKg && profile?.heightCm ? calculateBmi(m.weightKg, profile.heightCm) : null
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{formatDate(m.measuredAt)}</span>
                    <span style={{ color: 'var(--text)' }}>
                      {m.weightKg ? `${m.weightKg} kg` : '—'}{entryBmi ? ` · IMC ${entryBmi}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
            {history.length > 5 && (
              <button onClick={() => setShowAllHistory((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                {showAllHistory ? <><ChevronUp size={14} /> Ver menos</> : <><ChevronDown size={14} /> Ver todo</>}
              </button>
            )}
          </div>
        )}

        {/* AI health reports */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Análisis de salud IA</div>
            {reports.length > 0 && (
              <button onClick={() => setShowHistoryModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: '2px 6px' }}>
                Historial ({reports.length})
              </button>
            )}
          </div>
          {reports.length > 0 ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{formatDate(reports[0].createdAt)}</div>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 12px' }}>{reports[0].content}</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: '0 0 12px' }}>
              Genera un análisis personalizado basado en tus medidas.
            </p>
          )}
          <button className="btn-primary" onClick={handleGenerateMessage} disabled={loadingMessage || !bmi} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Sparkles size={14} />
            {loadingMessage ? 'Generando...' : reports.length > 0 ? 'Nuevo análisis' : 'Generar análisis'}
          </button>
          {!bmi && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
              Ingresa peso y altura para habilitar
            </p>
          )}
        </div>

        {/* App install + logout */}
        <div className="settings-group">
          {installPrompt && (
            <div className="settings-row" onClick={handleInstall} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleInstall() }}>
              <span className="settings-row-label" style={{ color: 'var(--primary)' }}>
                <Download size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
                Instalar App
              </span>
            </div>
          )}
          <div className="settings-row" onClick={handleLogout} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLogout() }} aria-label="Cerrar sesión">
            <span className="settings-row-label danger">
              <LogOut size={15} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Cerrar sesión
            </span>
          </div>
        </div>

        <div className="version-text">fitapp v0.1.0</div>
      </div>

      <BottomNav />

      {/* Health reports history modal */}
      {showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowHistoryModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px 16px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Historial de análisis</div>
              <button onClick={() => setHistorySortAsc((v) => !v)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                {historySortAsc ? '↑ Más antiguo' : '↓ Más reciente'}
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...reports]
                .sort((a, b) => {
                  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  return historySortAsc ? diff : -diff
                })
                .map((r) => (
                  <div key={r.id} style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 6 }}>{formatDate(r.createdAt)}</div>
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{r.content}</p>
                  </div>
                ))}
            </div>
            <button onClick={() => setShowHistoryModal(false)} style={{ marginTop: 16, padding: '12px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
