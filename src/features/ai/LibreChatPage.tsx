import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { desktop, isElectronRuntime, type BrowserBounds } from '@/lib/desktop'

/**
 * The AI tab is the official LibreChat client. The BrowserView is kept outside
 * the React compositor so LibreChat's own layout, shortcuts and focus model
 * remain untouched while the surrounding Mini-OS chrome stays responsive.
 */
export function LibreChatPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  const measure = useCallback((): BrowserBounds | null => {
    const host = hostRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    const viewportRight = Math.max(1, window.innerWidth)
    const viewportBottom = Math.max(1, window.innerHeight)
    const left = Math.max(0, Math.round(rect.left))
    const top = Math.max(0, Math.round(rect.top))
    const right = Math.max(left + 1, Math.min(viewportRight, Math.round(rect.right)))
    const bottom = Math.max(top + 1, Math.min(viewportBottom, Math.round(rect.bottom)))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }, [])

  const sync = useCallback(async () => {
    if (!isElectronRuntime()) return
    const bounds = measure()
    if (!bounds) return
    try {
      await desktop.libreChat.setBounds(bounds)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LibreChat alanı güncellenemedi.')
    }
  }, [measure])

  useLayoutEffect(() => {
    void sync()
    const host = hostRef.current
    if (!host) return undefined
    const observer = new ResizeObserver(() => void sync())
    observer.observe(host)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [sync])

  useEffect(() => {
    let cancelled = false
    if (!isElectronRuntime()) return undefined
    const activate = async () => {
      const bounds = measure()
      if (!bounds) return
      try {
        await desktop.libreChat.activate(bounds)
        if (!cancelled) setError(null)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'LibreChat başlatılamadı.')
      }
    }
    void activate()
    return () => {
      cancelled = true
      void desktop.libreChat.deactivate()
    }
  }, [measure])

  return (
    <section className="librechat-workspace" aria-label="LibreChat">
      <div ref={hostRef} className="librechat-view-host" aria-hidden="true" />
      {error && <div className="librechat-error" role="alert">{error}</div>}
    </section>
  )
}
