import { getToken } from './auth'

export const API_BASE = 'http://localhost:8787/api/v1'

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
    window.dispatchEvent(new Event('fitapp:unauthorized'))
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error((err as { message?: string }).message ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

export interface LoginResponse {
  token: string
  user: { id: string; email: string; name: string; role: 'admin' | 'member' }
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
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

export interface Session {
  id: string
  workoutId: string
  workoutName: string
  userId: string
  startedAt: string
  completedAt: string | null
  durationSeconds: number | null
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

export function getMySessions(page = 1, limit = 20): Promise<SessionsResponse> {
  return request(`/sessions/mine?page=${page}&limit=${limit}`)
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
