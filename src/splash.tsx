import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/outfit'
import '@fontsource-variable/plus-jakarta-sans'
import './styles/compact.css'
import { APP_EVENTS, type AppUpdateStatus } from '../shared/contracts'
import { APP_THEME_STORAGE_KEY, DEFAULT_APP_THEME, isAppTheme } from './theme'
import { EonLogo } from './components/brand/EonLogo'

document.documentElement.classList.add('splash-page')
const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
document.documentElement.dataset.appTheme = isAppTheme(storedTheme) ? storedTheme : DEFAULT_APP_THEME

const initialStatus: AppUpdateStatus = {
  phase: 'checking',
  message: 'Yeni sürüm denetleniyor',
  currentVersion: '',
}

function Splash() {
  const [status, setStatus] = useState<AppUpdateStatus>(initialStatus)

  useEffect(() => {
    const bridge = window.kapanisDesktop
    if (!bridge) return
    return bridge.on(APP_EVENTS.updateStatus, (payload) => {
      if (!payload || typeof payload !== 'object') return
      setStatus(payload as AppUpdateStatus)
    })
  }, [])

  return (
    <main className={`splash-window splash-window--${status.phase}`} data-window-drag role="status" aria-live="polite">
      <div className="splash-topline" data-window-drag>
        <span className="splash-brand">
          <EonLogo size={28} className="splash-brand-logo" />
          <span className="splash-kicker">EON</span>
        </span>
        <span className="splash-version">{status.currentVersion ? `v${status.currentVersion}` : 'desktop'}</span>
      </div>

      <div className="splash-content" data-window-drag>
        <div className="splash-lockup">
          <p className="splash-eyebrow">Çalışma alanın hazırlanıyor</p>
          <h1>Eon başlatılıyor</h1>
          <div className="splash-status-line">
            <span className="splash-status-dot" aria-hidden="true" />
            <span>{status.message}</span>
          </div>
        </div>
      </div>

      <div className="splash-bottom" data-window-drag>
        <div className="splash-progress" aria-hidden="true">
          <span style={status.progress == null ? undefined : { width: `${status.progress}%`, transform: 'none' }} />
        </div>
        <div className="splash-meta">
          <span>Yerel masaüstü</span>
          <span aria-hidden="true">·</span>
          <span>GitHub Releases</span>
        </div>
      </div>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('splash-root')!).render(
  <React.StrictMode><Splash /></React.StrictMode>,
)
