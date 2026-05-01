export interface WorkoutCollection {
  id: string
  userId: string
  name: string
  emoji: string
  workoutCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateCollectionBody {
  name: string
  emoji: string
}

export interface UpdateCollectionBody {
  name?: string
  emoji?: string
}
