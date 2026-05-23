import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles.css'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2_000,
      gcTime: 5 * 60 * 1_000
    }
  }
})

function MissingClerkKey() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Thiếu cấu hình</p>
        <h1>Chưa cấu hình đăng nhập</h1>
        <p>
          Vui lòng kiểm tra cấu hình đăng nhập của ứng dụng trước khi mở cho người dùng.
        </p>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    ) : (
      <MissingClerkKey />
    )}
  </StrictMode>
)
