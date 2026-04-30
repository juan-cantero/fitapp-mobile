export type ChallengeType = 'cumulative' | 'daily'
export type UserChallengeStatus = 'active' | 'completed' | 'failed'

export interface ChallengeItem {
  id: string
  exerciseId: string
  exerciseName: string
  targetReps: number | null
  targetSeconds: number | null
  orderIndex: number
}

export interface Challenge {
  id: string
  title: string
  description: string
  type: ChallengeType
  durationDays: number
  items: ChallengeItem[]
  createdBy: string
  createdAt: string
}

export interface ChallengeItemProgress {
  challengeItemId: string
  exerciseId: string
  exerciseName: string
  targetReps: number | null
  targetSeconds: number | null
  totalLogged: number
  dailyProgress: { date: string; value: number }[]
  orderIndex: number
}

export interface UserChallenge {
  id: string
  userId: string
  challengeId: string
  challenge: Challenge
  startedAt: string
  endsAt: string
  status: UserChallengeStatus
  completedAt: string | null
  itemProgress: ChallengeItemProgress[]
}

export interface LogChallengeProgressBody {
  challengeItemId: string
  reps?: number
  seconds?: number
  date?: string
}

export interface CreateChallengeItemInput {
  exerciseId: string
  orderIndex: number
  targetReps?: number
  targetSeconds?: number
}

export interface CreateChallengeInput {
  title: string
  description: string
  type: ChallengeType
  durationDays: number
  isPublic: boolean
  items: CreateChallengeItemInput[]
}
