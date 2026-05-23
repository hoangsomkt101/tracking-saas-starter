import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { DashboardLayout } from './app/DashboardLayout'
import { LandingPage } from './features/auth/LandingPage'
import type { ThemeMode } from './types/domain'

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    const savedTheme = window.localStorage.getItem('tracking-saas-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('tracking-saas-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes theme={theme} onToggleTheme={toggleTheme} />
    </BrowserRouter>
  )
}

function AppRoutes({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  const location = useLocation()

  if (location.pathname === '/') {
    return <LandingPage theme={theme} onToggleTheme={onToggleTheme} />
  }

  return (
    <>
      <SignedOut>
        <LandingPage theme={theme} onToggleTheme={onToggleTheme} />
      </SignedOut>
      <SignedIn>
        <DashboardLayout theme={theme} onToggleTheme={onToggleTheme} />
      </SignedIn>
    </>
  )
}
