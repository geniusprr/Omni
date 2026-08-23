import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/outfit'
import '@fontsource-variable/plus-jakarta-sans'
import './styles/compact.css'

document.documentElement.classList.add('splash-page')

function Splash() {
  return (
    <main className="splash-window" data-window-drag role="status" aria-live="polite">
      <div className="splash-topline" data-window-drag>
        <span className="splash-kicker">OMNI / DESKTOP</span>
        <span className="splash-status"><i aria-hidden="true" /> başlatılıyor</span>
      </div>

      <div className="splash-content" data-window-drag>
        <div className="splash-mark" aria-hidden="true"><span>O</span></div>
        <div className="splash-lockup">
          <h1>Omni</h1>
          <p>Sakin bir çalışma alanı hazırlanıyor.</p>
        </div>
      </div>

      <div className="splash-bottom" data-window-drag>
        <div className="splash-progress" aria-hidden="true"><span /></div>
        <div className="splash-meta">
          <span className="splash-meta__dot" aria-hidden="true" />
          <span>yerel oturum</span>
          <span className="splash-meta__separator">/</span>
          <span>güvenli başlatma</span>
        </div>
      </div>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('splash-root')!).render(
  <React.StrictMode><Splash /></React.StrictMode>,
)
