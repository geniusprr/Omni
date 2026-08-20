import { WebContentsView, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import type { BrowserManager } from './BrowserManager.js'
import { SessionManager } from './SessionManager.js'

const TAB_COUNT = 12

export async function runBrowserLifecycleSmoke(browser: BrowserManager, _window: BrowserWindow, baseUrl: string) {
  const ids = Array.from({ length: TAB_COUNT }, (_, index) => `smoke-${index + 1}`)
  const bounds = { x: 0, y: 0, width: 960, height: 620 }

  for (const id of ids) {
    const projection = browser.createTab(id, `${baseUrl}/page?tab=${id}`, bounds)
    if (!browser.tabs.get(id)?.view || !(browser.tabs.get(id)?.view instanceof WebContentsView)) throw new Error(`${id}: WebContentsView oluşturulmadı`)
    await waitForStop(browser.tabs.get(id)!.webContents)
    if (!browser.tabs.get(id)?.projection.favicon) throw new Error(`${id}: favicon alınamadı`)
  }

  for (const id of ids) {
    browser.activateTab(id, true)
    browser.activateTab(id, false)
  }
  browser.activateTab(ids[0], true)
  const duplicateId = 'smoke-duplicate'
  browser.duplicateTab(ids[1], duplicateId, bounds)
  await waitForStop(browser.tabs.get(duplicateId)!.webContents)
  if (!(browser.tabs.get(duplicateId)?.view instanceof WebContentsView)) throw new Error('Duplicate sekme WebContentsView kullanmadı')
  browser.setPinned(ids[1], true)
  browser.setMuted(ids[1], true)
  const pinnedDuplicateId = 'smoke-pinned-duplicate'
  const pinnedDuplicate = browser.duplicateTab(ids[1], pinnedDuplicateId, bounds)
  await waitForStop(browser.tabs.get(pinnedDuplicateId)!.webContents)
  if (pinnedDuplicate.pinned !== true || pinnedDuplicate.muted !== true) throw new Error('Pinned/muted sekme duplicate durumunu korumadı')
  if (browser.getSession().tabs.length < TAB_COUNT + 1) throw new Error('Session restore kaydı sekmeleri persist etmedi')

  browser.navigate(ids[1], `${baseUrl}/page?tab=navigation-check`)
  await waitForStop(browser.tabs.get(ids[1])!.webContents)
  browser.back(ids[1])
  await waitUntil(() => !browser.tabs.get(ids[1])?.projection.url.includes('navigation-check'), 5_000, 'Back navigasyonu çalışmadı')
  browser.forward(ids[1])
  await waitUntil(() => browser.tabs.get(ids[1])?.projection.url.includes('navigation-check') === true, 5_000, 'Forward navigasyonu çalışmadı')
  if (!browser.tabs.get(ids[1])?.projection.url.includes('navigation-check')) throw new Error('Back/forward navigasyonu çalışmadı')

  const first = browser.tabs.get(ids[0])!
  const firstWebContentsId = first.webContents.id
  await first.webContents.executeJavaScript(`(async () => {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const destination = context.createMediaStreamDestination()
    oscillator.connect(destination)
    oscillator.frequency.value = 220
    const audio = new Audio()
    audio.autoplay = true
    audio.srcObject = destination.stream
    document.body.appendChild(audio)
    await context.resume()
    await audio.play()
    window.__kapanisSmokeStop = () => { oscillator.stop(); audio.pause(); audio.srcObject = null; void context.close() }
    return context.state
  })()`, true)
  await wait(250)
  await browser.media.syncAll()
  if (!browser.media.get(ids[0])?.playing) throw new Error('Medya probe aktif ses durumunu yakalayamadı')

  await first.webContents.executeJavaScript(`document.documentElement.requestFullscreen().catch(() => false)`, true)
  await waitUntil(() => _window.isFullScreen(), 5_000, 'Fullscreen video görünümü etkinleşmedi')
  await first.webContents.executeJavaScript(`document.exitFullscreen().catch(() => undefined)`, true)
  await waitUntil(() => !_window.isFullScreen(), 5_000, 'Fullscreen video görünümü kapanmadı')

  first.webContents.downloadURL(`${baseUrl}/download.txt`)
  const download = await waitForDownload(browser, 10_000)
  if (download.state !== 'completed' || !download.path) throw new Error('Download sistemi dosyayı tamamlamadı')
  fs.rmSync(download.path, { force: true })
  browser.removeDownload(download.id)

  browser.sessions.flush()
  const restored = new SessionManager().getSnapshot()
  if (restored.tabs.length < TAB_COUNT + 1 || !restored.tabs.some((tab) => tab.id === duplicateId)) throw new Error('Session restore diske yazılmadı')

  const openedBeforePopup = browser.tabs.list().length
  await first.webContents.executeJavaScript(`window.open('${baseUrl}/page?popup=1', '_blank')`, true)
  await wait(100)
  if (browser.tabs.list().length !== openedBeforePopup) throw new Error('Kontrolsüz popup yeni sekme oluşturdu')

  await browser.closeTab(ids[0])
  await wait(250)
  if (browser.tabs.get(ids[0])) throw new Error('Kapatılan sekme manager içinde kaldı')
  if (browser.media.get(ids[0])) throw new Error('Kapatılan sekmenin medya kaydı kaldı')
  if (browser.tabs.snapshot().webContentsIds.includes(firstWebContentsId)) throw new Error('Kapatılan sekmenin webContents rendererı kaldı')

  await browser.closeTab(duplicateId)
  await browser.closeTab(pinnedDuplicateId)
  for (const id of ids.slice(1)) await browser.closeTab(id)
  const snapshot = browser.getDebugSnapshot()
  if (snapshot.openTabIds.length !== 0 || snapshot.webContentsIds.length !== 0 || snapshot.mediaIds.length !== 0) {
    throw new Error('Tüm sekmeler kapatıldıktan sonra renderer/media sızıntısı kaldı: ' + JSON.stringify(snapshot))
  }
  browser.saveSession({ tabs: [], activeTabId: null })
  console.log(`[browser-smoke] ${TAB_COUNT}+ WebContentsView sekme, favicon, back/forward, fullscreen, download, popup, medya ve renderer cleanup testleri geçti`)
}

function waitForStop(webContents: Electron.WebContents) {
  if (webContents.isDestroyed() || !webContents.isLoading()) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      webContents.removeListener('did-stop-loading', onStop)
      reject(new Error(`Sekme yükleme zaman aşımına uğradı: ${webContents.getURL()}`))
    }, 15_000)
    const onStop = () => {
      clearTimeout(timer)
      resolve()
    }
    webContents.once('did-stop-loading', onStop)
  })
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function waitUntil(check: () => boolean, timeout: number, message: string) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (check()) return
    await wait(50)
  }
  throw new Error(message)
}

async function waitForDownload(browser: BrowserManager, timeout: number) {
  let result: ReturnType<BrowserManager['listDownloads']>[number] | undefined
  await waitUntil(() => {
    result = browser.listDownloads().find((item) => item.url.includes('/download.txt'))
    return result?.state === 'completed' || result?.state === 'interrupted' || result?.state === 'cancelled'
  }, timeout, 'Download sistemi zaman aşımına uğradı')
  if (!result) throw new Error('Download kaydı oluşmadı')
  return result
}
