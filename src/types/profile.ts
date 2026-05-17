export interface UserProfile {
  userId: string
  avatarUrl: string | null
  heightCm: number | null
  updatedAt: string
}

export interface BodyMeasurement {
  id: string
  userId: string
  measuredAt: string
  weightKg: number | null
  waistCm: number | null
  armCm: number | null
  legsCm: number | null
  glutesCm: number | null
}

export interface AddMeasurementBody {
  weightKg?: number
  waistCm?: number
  armCm?: number
  legsCm?: number
  glutesCm?: number
}

export interface HealthMessageBody {
  weightKg: number
  heightCm: number
  waistCm?: number
  armCm?: number
  legsCm?: number
  glutesCm?: number
  goalText?: string
}

export interface HealthReport {
  id: string
  userId: string
  content: string
  createdAt: string
}

export interface UserGoals {
  userId: string
  weightKg: number | null
  waistCm: number | null
  armCm: number | null
  legsCm: number | null
  glutesCm: number | null
  goalText: string | null
  updatedAt: string
}

export interface SaveGoalsBody {
  weightKg?: number | null
  waistCm?: number | null
  armCm?: number | null
  legsCm?: number | null
  glutesCm?: number | null
  goalText?: string | null
}
