import { useEffect } from 'react'
import { isElectronRuntime } from '@/lib/desktop'
import { requestBrowserNavigation } from '@/features/browser/browserData'
import { setYouTubeMusicSession, syncYouTubeMusicState } from './youtubeMusicSession'

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com/'

interface YouTubeMusicPageProps {
  isVisible?: boolean
}

/**
 * YouTube Music is hosted by the central Electron browser tab system. This
 * screen intentionally contains no second page host or renderer lifecycle.
 */
export function YouTubeMusicPage({ isVisible = true }: YouTubeMusicPageProps) {
  useEffect(() => {
    setYouTubeMusicSession({ visible: isVisible, ready: isElectronRuntime(), error: null })
    if (!isElectronRuntime()) return
    void syncYouTubeMusicState().catch(() => undefined)
    const timer = window.setInterval(() => void syncYouTubeMusicState().catch(() => undefined), 1_000)
    return () => window.clearInterval(timer)
  }, [isVisible])

  function openInBrowser() {
    requestBrowserNavigation(YOUTUBE_MUSIC_URL)
  }

  return <div className="youtube-music-webview-host" data-youtube-music-browser>
    <div className="youtube-music-browser-fallback">
      <p>YouTube Music, Omni tarayıcı sekmelerinde çalışır.</p>
      <button type="button" onClick={openInBrowser}>Tarayıcı sekmesinde aç</button>
      {!isElectronRuntime() ? <small>Bu özellik Electron masaüstü uygulamasında kullanılabilir.</small> : null}
    </div>
  </div>
}
