// main.tsx
// ============================================================
// LOKMA — App bootstrap (premium refactor)
// - Top-level ErrorBoundary (crash oldini olish)
// - Global unhandledrejection + error listeners
// - initTheme try-catch (broken localStorage'da yiqilmaydi)
// - Missing root element handling
// ============================================================

import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTheme } from './theme'
import App from './App.tsx'
import './i18n'

// ============================================================
// GLOBAL ERROR HANDLERS
// ============================================================
function reportGlobalError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  try {
    const msg = error instanceof Error ? error.message : String(error)
    // eslint-disable-next-line no-console
    console.error(`[Lokma:${scope}]`, msg, extra ?? {}, error)
    // Kelajakda: Sentry.captureException(error, { tags: { scope }, extra })
  } catch { /* silent */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', ev => {
    reportGlobalError('unhandledrejection', ev.reason)
  })
  window.addEventListener('error', ev => {
    reportGlobalError('window.error', ev.error ?? ev.message, {
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
    })
  })
}

// ============================================================
// THEME INIT (broken localStorage'da yiqilmaydi)
// ============================================================
try {
  initTheme()
} catch (err) {
  reportGlobalError('initTheme', err)
}

// ============================================================
// ERROR BOUNDARY
// ============================================================
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportGlobalError('ErrorBoundary', error, { componentStack: info.componentStack })
  }

  private handleReload = (): void => {
    try {
      window.location.reload()
    } catch { /* silent */ }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: '#ECEEF5',
            color: '#1c1917',
            fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐺</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Kutilmagan xato
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#78716c', marginBottom: '1.5rem', maxWidth: 320 }}>
            Ilovada muammo yuz berdi. Sahifani qayta yuklab ko'ring.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '1rem',
              background: '#5B6AD0',
              color: 'white',
              fontWeight: 800,
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Qayta yuklash
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#fff',
                borderRadius: '0.75rem',
                fontSize: '0.75rem',
                textAlign: 'left',
                maxWidth: '90vw',
                overflow: 'auto',
                color: '#dc2626',
              }}
            >
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================
// MOUNT
// ============================================================
const rootEl = document.getElementById('root')

if (!rootEl) {
  reportGlobalError('mount', new Error('#root element not found'))
  document.body.innerHTML =
    '<div style="padding:2rem;font-family:system-ui;text-align:center;color:#dc2626">' +
    '<h1>Xato: #root element topilmadi</h1>' +
    '<p>Iltimos sahifani yangilang.</p>' +
    '</div>'
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>
  )
}