import { SignInButton } from '@clerk/clerk-react'
import { ChevronRight, Command, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ThemeToggle } from '../../components/common/ThemeToggle'
import type { ThemeMode } from '../../types/domain'

export function SignedOutHome({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <main className="auth-shell shadcn-theme">
      <div className="auth-theme-toggle">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <section className="landing-shell">
        <div className="landing-sidebar-preview">
          <div className="mini-brand"><Command size={16} /> Aff Track Pro</div>
          <div className="mini-nav active" />
          <div className="mini-nav" />
          <div className="mini-nav short" />
        </div>
        <div className="hero-card">
          <Badge variant="secondary" className="hero-badge"><Sparkles size={14} /> shadcnspace inspired dashboard</Badge>
          <div>
            <h1>Affiliate tracking dashboard</h1>
            <p className="hero-copy">
              Giao diện sidebar + topbar hiện đại, giúp bạn quản lý tracking affiliate tập trung trong một nơi.
            </p>
          </div>
          <SignInButton mode="modal">
            <Button type="button" size="lg" className="hero-button">
              Đăng nhập để bắt đầu
              <ChevronRight size={18} />
            </Button>
          </SignInButton>
        </div>
      </section>
    </main>
  )
}
