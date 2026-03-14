import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { LoginPage } from './pages/auth/LoginPage'
import { HomePage } from './pages/home/HomePage'
import { WorkoutsPage } from './pages/workouts/WorkoutsPage'
import { WorkoutDetailPage } from './pages/workouts/WorkoutDetailPage'
import { CreateWorkoutPage } from './pages/workouts/CreateWorkoutPage'
import { EditWorkoutPage } from './pages/workouts/EditWorkoutPage'
import { GuidedWorkoutPage } from './pages/workout/GuidedWorkoutPage'
import { ExercisesPage } from './pages/exercises/ExercisesPage'
import { ProgressPage } from './pages/progress/ProgressPage'
import { SessionDetailPage } from './pages/progress/SessionDetailPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { getToken } from './lib/auth'

function UnauthorizedListener() {
  const navigate = useNavigate()
  useEffect(() => {
    function handleUnauthorized() {
      localStorage.removeItem('fitapp_token')
      localStorage.removeItem('fitapp_user')
      navigate('/login', { replace: true })
    }
    window.addEventListener('fitapp:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('fitapp:unauthorized', handleUnauthorized)
  }, [navigate])
  return null
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = getToken()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <UnauthorizedListener />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/workouts/new" element={<RequireAuth><CreateWorkoutPage /></RequireAuth>} />
        <Route path="/workouts/:id/edit" element={<RequireAuth><EditWorkoutPage /></RequireAuth>} />
        <Route path="/workouts/:id/start" element={<RequireAuth><GuidedWorkoutPage /></RequireAuth>} />
        <Route path="/workouts/:id" element={<RequireAuth><WorkoutDetailPage /></RequireAuth>} />
        <Route path="/workouts" element={<RequireAuth><WorkoutsPage /></RequireAuth>} />
        <Route path="/exercises" element={<RequireAuth><ExercisesPage /></RequireAuth>} />
        <Route path="/progress" element={<RequireAuth><ProgressPage /></RequireAuth>} />
        <Route path="/sessions/:id" element={<RequireAuth><SessionDetailPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
