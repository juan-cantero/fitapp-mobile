import { NavLink } from 'react-router-dom'
import { Home, Dumbbell, BookOpen, TrendingUp, User } from 'lucide-react'

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/home" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
        <Home size={22} strokeWidth={1.8} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/workouts" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
        <Dumbbell size={22} strokeWidth={1.8} />
        <span>Workouts</span>
      </NavLink>
      <NavLink to="/exercises" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
        <BookOpen size={22} strokeWidth={1.8} />
        <span>Exercises</span>
      </NavLink>
      <NavLink to="/progress" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
        <TrendingUp size={22} strokeWidth={1.8} />
        <span>Progress</span>
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
        <User size={22} strokeWidth={1.8} />
        <span>Profile</span>
      </NavLink>
    </nav>
  )
}
