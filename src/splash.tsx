import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/outfit'
import '@fontsource-variable/plus-jakarta-sans'
import './styles/compact.css'

function Splash() {
  return (
    <div className="splash-window" data-window-drag>
      <div className="splash-lockup" data-window-drag>
        <span className="splash-mark" aria-hidden="true" />
        <strong>kapanış.</strong>
        <span>yerel Windows aracı</span>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('splash-root')!).render(
  <React.StrictMode><Splash /></React.StrictMode>,
)
