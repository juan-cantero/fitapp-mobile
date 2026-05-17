import type { Workout, WorkoutSection, Session } from './api'

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function workoutToMarkdown(workout: Workout): string {
  const lines: string[] = []
  lines.push(`# ${workout.name}`, '')
  if (workout.description) lines.push(workout.description, '')
  if (workout.estimatedMinutes) lines.push(`**Estimated time:** ${workout.estimatedMinutes} min  `)
  lines.push('', '---', '')

  const sections: WorkoutSection[] = [...workout.sections]
    .filter(s => s.items.length > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex)

  for (const section of sections) {
    const label = section.type === 'warmup' ? 'Warmup' : section.type === 'cooldown' ? 'Cooldown' : 'Main'
    lines.push(`## ${label}`, '')
    for (const item of section.items) {
      lines.push(`### ${item.exerciseName}`)
      const volume = item.reps != null
        ? `${item.sets} × ${item.reps} reps`
        : item.durationSeconds != null
          ? `${item.sets} × ${item.durationSeconds}s`
          : `${item.sets} sets`
      lines.push(`- **Volume:** ${volume}`)
      if (item.weightKg != null) lines.push(`- **Weight:** ${item.weightKg} kg`)
      if (item.restSeconds > 0) lines.push(`- **Rest:** ${item.restSeconds}s`)
      if (item.notes) lines.push(`- **Notes:** ${item.notes}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

export function weeklyReportToMarkdown(sessions: Session[], weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59)

  const weekSessions = sessions
    .filter(s => {
      const d = new Date(s.startedAt)
      return d >= start && d <= end
    })
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())

  const totalSets = weekSessions.reduce((sum, s) => sum + (s.sets?.length ?? 0), 0)
  const totalVolume = weekSessions.reduce((sum, s) =>
    sum + (s.sets ?? []).reduce((v, set) => v + (set.weightKg ?? 0) * (set.repsDone ?? 0), 0), 0)

  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
  const fmtDuration = (sec: number | null): string | null => {
    if (!sec) return null
    const m = Math.round(sec / 60)
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
  }

  const lines: string[] = []
  lines.push(`# Weekly Training Report`, `**Period:** ${startLabel} – ${endLabel}`, '')
  lines.push('## Summary')
  lines.push(`- **Sessions:** ${weekSessions.length}`)
  if (totalSets > 0) lines.push(`- **Total sets:** ${totalSets}`)
  if (totalVolume > 0) lines.push(`- **Total volume:** ${Math.round(totalVolume).toLocaleString()} kg`)
  lines.push('', '---', '')

  if (weekSessions.length === 0) {
    lines.push('No sessions logged this week.')
    return lines.join('\n')
  }

  lines.push('## Sessions', '')
  for (const session of weekSessions) {
    lines.push(`### ${fmtDate(session.startedAt)} — ${session.workoutName}`)
    const dur = fmtDuration(session.durationSeconds)
    if (dur) lines.push(`**Duration:** ${dur}  `)
    lines.push('')
    if (session.sets && session.sets.length > 0) {
      const byExercise = new Map<string, typeof session.sets>()
      for (const set of session.sets) {
        const existing = byExercise.get(set.exerciseName) ?? []
        existing.push(set)
        byExercise.set(set.exerciseName, existing)
      }
      for (const [exerciseName, sets] of byExercise) {
        lines.push(`**${exerciseName}**`)
        for (const set of [...sets].sort((a, b) => a.setNumber - b.setNumber)) {
          const reps = set.repsDone != null ? `${set.repsDone} reps` : '—'
          const weight = set.weightKg != null ? ` × ${set.weightKg} kg` : ''
          lines.push(`- Set ${set.setNumber}: ${reps}${weight}`)
        }
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}
