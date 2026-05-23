import { Moon, Sun } from 'lucide-react'
import { Button } from '../ui/button'
import type { ThemeMode } from '../../types/domain'

export function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const isDark = theme === 'dark'

  return (
    <Button variant="outline" size="icon" type="button" onClick={onToggle} aria-label="Toggle light/dark theme">
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}
