import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Sparkles, Loader } from 'lucide-react'
import { BottomNav } from '../../components/BottomNav'
import { suggestWorkout } from '../../lib/api'

const MAX_CHARS = 500

const EXAMPLE_CHIPS: { label: string; prompt: string }[] = [
  { label: '💪 Explosive full body', prompt: 'Explosive full body workout, high intensity' },
  { label: '🍑 Glute focused', prompt: 'Glute focused lower body workout' },
  { label: '⬆️ Upper body push', prompt: 'Upper body push workout, chest and shoulders' },
  { label: '🧘 Mobility & recovery', prompt: 'Mobility and recovery session, light stretching' },
]

export function WorkoutGeneratorPage() {
  const navigate = useNavigate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChipClick(chipPrompt: string) {
    setPrompt(chipPrompt)
    textareaRef.current?.focus()
  }

  async function handleGenerate() {
    if (!prompt.trim() || isLoading) return
    setError(null)
    setIsLoading(true)
    try {
      const result = await suggestWorkout(prompt.trim())
      sessionStorage.setItem('ai_workout_draft', JSON.stringify(result))
      navigate('/workouts/new')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workout')
    } finally {
      setIsLoading(false)
    }
  }

  const canGenerate = prompt.trim().length > 0 && !isLoading

  return (
    <div className="phone-shell">
      {/* Header */}
      <header className="app-header">
        <button
          className="header-back-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
          AI Workout
        </button>
      </header>

      <div className="content" style={{ paddingBottom: 100 }}>

        {/* Intro text */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 22, fontWeight: 800, color: 'var(--text)',
            letterSpacing: '-0.4px', marginBottom: 6,
          }}>
            Generate with AI ✨
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Describe the workout you want and we'll build it for you.
          </div>
        </div>

        {/* Prompt textarea */}
        <div className="form-field">
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              className="form-textarea"
              rows={5}
              placeholder="Describe your workout... e.g. 'explosive legs like Goku' or 'quick upper body'"
              value={prompt}
              maxLength={MAX_CHARS}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              aria-label="Workout prompt"
              style={{ resize: 'none', paddingBottom: 28 }}
            />
            {/* Character counter */}
            <span style={{
              position: 'absolute', bottom: 10, right: 12,
              fontSize: 11, fontWeight: 500,
              color: prompt.length >= MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)',
            }}>
              {prompt.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        {/* Example chips */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
          }}>
            Examples
          </div>
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto',
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            paddingBottom: 4,
          }}>
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleChipClick(chip.prompt)}
                disabled={isLoading}
                style={{
                  flexShrink: 0,
                  padding: '8px 14px',
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1.5px solid var(--border)',
                  background: prompt === chip.prompt
                    ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                    : 'var(--surface)',
                  color: prompt === chip.prompt ? 'var(--primary)' : 'var(--text-muted)',
                  borderColor: prompt === chip.prompt ? 'var(--primary)' : 'var(--border)',
                  cursor: 'pointer',
                  transition: 'all var(--transition)',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error card */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px',
            background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
          }}>
            <AlertCircle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>
              {error}
            </span>
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
          style={{
            opacity: canGenerate ? 1 : 0.45,
            transition: 'opacity var(--transition)',
          }}
        >
          {isLoading ? (
            <>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Generating your workout...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Generate
            </>
          )}
        </button>

      </div>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <BottomNav />
    </div>
  )
}
