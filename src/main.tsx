import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/outfit'
import '@fontsource-variable/plus-jakarta-sans'
import App from './App'
import './styles/compact.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
