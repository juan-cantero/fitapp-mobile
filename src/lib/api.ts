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

export interface Workout {
  id: string
  name: string
  description?: string
  estimatedDuration: number
  sections: WorkoutSection[]
  isPublic: boolean
  createdAt: string
}

export interface WorkoutSection {
  id: string
  type: 'warmup' | 'main' | 'cooldown'
  exercises: WorkoutExercise[]
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  exerciseName: string
  mediaUrl?: string
  sets: number
  reps: number
  restSeconds: number
  notes?: string
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
