import { getToken, getRefreshToken, updateTokens, clearAuth, saveAuth } from './auth'

export const API_BASE = import.meta.env.VITE_API_BASE as string

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return false

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return false

      const data = await res.json() as { token: string; refreshToken: string }
      updateTokens(data.token, data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options)   // retry with new token
    clearAuth()
    window.dispatchEvent(new Event('fitapp:unauthorized'))
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    let message = `Something went wrong (${res.status})`
    try {
      const body = await res.json() as { message?: string; code?: string }
      message = body.message ?? body.code ?? message
    } catch { /* ignore */ }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: { id: string; email: string; name: string; role: 'admin' | 'member' }
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function loginAndSave(email: string, password: string): Promise<LoginResponse> {
  const res = await login(email, password)
  saveAuth(res.token, res.refreshToken, res.user)
  return res
}

export interface WorkoutSectionItem {
  id: string
  exerciseId: string
  exerciseName: string
  exerciseNameEn: string | null
  mediaUrl: string | null
  orderIndex: number
  sets: number
  reps: number | null
  durationSeconds: number | null
  weightKg: number | null
  restSeconds: number
  notes: string | null
}

export interface WorkoutSection {
  id: string
  type: 'warmup' | 'main' | 'cooldown'
  orderIndex: number
  items: WorkoutSectionItem[]
}

export interface Workout {
  id: string
  name: string
  description: string | null
  tags: string[]
  visibility: 'private' | 'public'
  estimatedMinutes: number | null
  coverImageUrl: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  sections: WorkoutSection[]
}

export interface WorkoutsResponse {
  data: Workout[]
  total: number
  page: number
  limit: number
}

export function listWorkouts(page = 1, limit = 20): Promise<WorkoutsResponse> {
  return request(`/workouts?page=${page}&limit=${limit}`)
}

export function listMyWorkouts(page = 1, limit = 20): Promise<WorkoutsResponse> {
  return request(`/workouts/mine?page=${page}&limit=${limit}`)
}

export function getWorkout(id: string): Promise<Workout> {
  return request(`/workouts/${id}`)
}

export interface SessionSet {
  id: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  repsDone: number | null
  weightKg: number | null
  loggedAt: string
}

export interface Session {
  id: string
  workoutId: string
  workoutName: string
  userId: string
  startedAt: string
  completedAt: string | null
  durationSeconds: number | null
  sets?: SessionSet[]
}

export interface SessionsResponse {
  data: Session[]
  total: number
  page: number
  limit: number
}

export interface UserStats {
  totalSessions: number
  currentStreak: number
  weeklyCount: number
  totalSets: number
  totalVolumeKg: number
  lastSessionAt: string | null
}

export function getMyStats(): Promise<UserStats> {
  return request('/sessions/mine/stats')
}

export function getSession(id: string): Promise<Session> {
  return request(`/sessions/${id}`)
}

export function getMySessions(page = 1, limit = 20): Promise<SessionsResponse> {
  return request(`/sessions/mine?page=${page}&limit=${limit}`)
}

export interface MuscleInsight {
  muscle: string
  sets: number
}

export interface ExerciseInsight {
  exerciseId: string
  name: string
  totalSets: number
  totalReps: number
}

export interface SessionInsights {
  topMuscles: MuscleInsight[]
  topExercises: ExerciseInsight[]
}

export function getMyInsights(days = 30): Promise<SessionInsights> {
  return request(`/sessions/mine/insights?days=${days}`)
}

export interface StartSessionResponse {
  id: string
  workoutId: string
  workoutName: string
  userId: string
  startedAt: string
  completedAt: string | null
  durationSeconds: number | null
}

export function getOpenSession(workoutId: string): Promise<{ session: Session | null }> {
  return request(`/sessions/mine/open?workoutId=${workoutId}`)
}

export function startSession(workoutId: string): Promise<StartSessionResponse> {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ workoutId }),
  })
}

export interface LogSetResponse {
  id: string
  sessionId: string
  exerciseId: string
  setNumber: number
  repsDone: number | null
  weightKg: number | null
  loggedAt: string
}

export function logSet(
  sessionId: string,
  payload: { exerciseId: string; setNumber: number; repsDone: number | null; weightKg: number | null }
): Promise<LogSetResponse> {
  return request(`/sessions/${sessionId}/sets`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function finishSession(sessionId: string, durationSeconds: number): Promise<StartSessionResponse> {
  return request(`/sessions/${sessionId}/finish`, {
    method: 'PUT',
    body: JSON.stringify({ durationSeconds }),
  })
}

export interface ExerciseBasic {
  id: string
  name: string
  nameEn: string | null
  mediaUrl: string | null
  primaryMuscle: string
}

export interface ExercisesListResponse {
  data: ExerciseBasic[]
  total: number
  page: number
  limit: number
}

export type MuscleGroup =
  | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'abductors' | 'calves'
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'core'

export interface ExerciseDetail {
  id: string
  name: string
  nameEn: string | null
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  movementPattern: string
  equipment: string[]
  isCompound: boolean
  bodyPosition: string
  mediaUrl: string | null
  instructions: string | null
}

export function listExercises(
  search?: string,
  page = 1,
  limit = 50,
  primaryMuscle?: string,
): Promise<ExercisesListResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (search) params.set('search', search)
  if (primaryMuscle) params.set('primaryMuscle', primaryMuscle)
  return request(`/exercises?${params}`)
}

export function getExercise(id: string): Promise<ExerciseDetail> {
  return request(`/exercises/${id}`)
}

export interface SubstituteExercise {
  exercise: ExerciseBasic & { primaryMuscle: string }
  score: number
  source: 'curated' | 'algorithmic'
}

export function getExerciseSubstitutes(id: string): Promise<{ data: SubstituteExercise[] }> {
  return request(`/exercises/${id}/substitutes`)
}

export interface CreateWorkoutSectionItemPayload {
  exerciseId: string
  orderIndex: number
  sets: number
  reps: number | null
  durationSeconds: number | null
  weightKg: number | null
  restSeconds: number
  notes: string | null
}

export interface CreateWorkoutSectionPayload {
  type: 'warmup' | 'main' | 'cooldown'
  orderIndex: number
  items: CreateWorkoutSectionItemPayload[]
}

export interface CreateWorkoutPayload {
  name: string
  description: string | null
  tags: string[]
  visibility: 'private' | 'public'
  estimatedMinutes: number | null
  sections: CreateWorkoutSectionPayload[]
}

export function createWorkout(payload: CreateWorkoutPayload): Promise<Workout> {
  return request('/workouts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateWorkout(id: string, payload: CreateWorkoutPayload): Promise<Workout> {
  return request(`/workouts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
