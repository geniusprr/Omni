import { BrowserView, type BrowserWindow } from 'electron'
import type { BrowserManager } from './BrowserManager.js'

const TAB_COUNT = 3

/**
 * Exercises the exact lifecycle that can make an embedded page appear blank:
 * create detached, measure/set bounds, attach, switch, resize, and detach.
 * This intentionally avoids unrelated media, fullscreen, and download tests so
 * the browser-viewport signal remains fast and deterministic.
 */
export async function runBrowserLifecycleSmoke(browser: BrowserManager, window: BrowserWindow, baseUrl: string) {
  const ids = Array.from({ length: TAB_COUNT }, (_, index) => `smoke-${index + 1}`)
  const initialBounds = { x: 72, y: 96, width: 880, height: 520 }

  for (const id of ids) {
    browser.createTab(id, `${baseUrl}/page?tab=${id}`, initialBounds)
    const record = browser.tabs.get(id)
    if (!record?.view || !(record.view instanceof BrowserView)) {
      throw new Error(`${id}: BrowserView oluşturulmadı`)
    }
    await waitUntil(
      () => !record.webContents.isLoading() && record.webContents.getURL().startsWith(baseUrl),
      10_000,
      `${id}: sayfa yüklenemedi`,
    )
  }

  browser.activateTab(ids[0], true)
  await assertVisibleViewIsPainted(browser, ids[0], initialBounds)

  browser.activateTab(ids[1], true)
  await assertOnlyActiveViewIsVisible(browser, ids[1])
  await assertVisibleViewIsPainted(browser, ids[1], initialBounds)

  const resizedBounds = { x: 84, y: 112, width: 760, height: 440 }
  browser.setBounds(ids[1], resizedBounds)
  await assertVisibleViewIsPainted(browser, ids[1], resizedBounds)

  // The browser must follow the application's explicit theme rather than the
  // Windows setting. Test both a page that loads under dark mode and an
  // already-loaded page switching back to light mode.
  browser.setTheme('dark')
  await assertPageTheme(browser, ids[1], 'dark')

  browser.navigate(ids[1], `${baseUrl}/page?tab=navigation-check`)
  const activeRecord = browser.tabs.get(ids[1])
  if (!activeRecord) throw new Error('Aktif sekme kaydı bulunamadı.')
  await waitUntil(
    () => !activeRecord.webContents.isLoading() && activeRecord.webContents.getURL().includes('navigation-check'),
    10_000,
    'Aktif sekme yeniden yüklenemedi',
  )
  await assertVisibleViewIsPainted(browser, ids[1], resizedBounds)
  await assertPageTheme(browser, ids[1], 'dark')

  browser.setTheme('light')
  await assertPageTheme(browser, ids[1], 'light')

  browser.deactivate()
  await assertOnlyActiveViewIsVisible(browser, null)

  for (const id of ids) await browser.closeTab(id)
  const snapshot = browser.getDebugSnapshot()
  if (snapshot.openTabIds.length !== 0 || snapshot.webContentsIds.length !== 0 || snapshot.viewStates.length !== 0) {
    throw new Error(`Sekmeler kapatıldıktan sonra native görünüm kaldı: ${JSON.stringify(snapshot)}`)
  }

  browser.saveSession({ tabs: [], activeTabId: null })
  console.log(`[browser-smoke] ${TAB_COUNT} BrowserView: ölçüm, görünürlük, sekme geçişi, yeniden boyutlandırma ve temizleme geçti`)
  // BrowserWindow owns the native child hierarchy under test.
  void window
}

async function assertVisibleViewIsPainted(
  browser: BrowserManager,
  id: string,
  expectedBounds: { x: number; y: number; width: number; height: number },
) {
  await wait(100)
  const state = browser.getDebugSnapshot().viewStates.find((view) => view.id === id)
  if (!state?.visible) throw new Error('Aktif BrowserView pencereye bağlı değil.')
  if (
    state.bounds.x !== expectedBounds.x
    || state.bounds.y !== expectedBounds.y
    || state.bounds.width !== expectedBounds.width
    || state.bounds.height !== expectedBounds.height
  ) {
    throw new Error(`BrowserView yanlış sınırlarla etkinleşti: ${JSON.stringify(state.bounds)}`)
  }

  const record = browser.tabs.get(id)
  if (!record) throw new Error('Aktif BrowserView kaydı bulunamadı.')
  // capturePage is not reliable for a detached/reattached BrowserView in a
  // GPU-disabled Windows smoke process (it can throw UnknownVizError even
  // though the page has rendered). Verify the actual child renderer instead:
  // the page must be complete, laid out, and contain its known body. A smoke
  // window can be backgrounded while the developer app has focus, so document
  // visibility is intentionally recorded but not treated as a failure.
  const renderState = await record.webContents.executeJavaScript(
    `({
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      hasSmokeContent: document.body?.innerText.includes('Omni browser lifecycle smoke test') === true,
    })`,
    true,
  ) as {
    readyState: string
    visibilityState: string
    width: number
    height: number
    hasSmokeContent: boolean
  }
  if (
    renderState.readyState !== 'complete'
    || renderState.width < 1
    || renderState.height < 1
    || !renderState.hasSmokeContent
  ) {
    throw new Error(`Aktif BrowserView renderer durumu beklenenden farklı: ${JSON.stringify(renderState)}`)
  }
}

async function assertPageTheme(browser: BrowserManager, id: string, expected: 'light' | 'dark') {
  const record = browser.tabs.get(id)
  if (!record) throw new Error('Tema kontrolü için BrowserView kaydı bulunamadı.')
  const expectedDark = expected === 'dark'
  const expectedBackground = expectedDark ? 'rgb(22, 30, 45)' : 'rgb(25, 104, 217)'
  await waitUntilAsync(async () => {
    const state = await record.webContents.executeJavaScript(
      `({
        dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
        background: getComputedStyle(document.body).backgroundColor,
      })`,
      true,
    ) as { dark: boolean; background: string }
    return state.dark === expectedDark && state.background === expectedBackground
  }, 5_000, `BrowserView ${expected} tema sinyalini almadı.`)
}

async function assertOnlyActiveViewIsVisible(browser: BrowserManager, expectedId: string | null) {
  const visible = browser.getDebugSnapshot().viewStates.filter((view) => view.visible).map((view) => view.id)
  const expected = expectedId ? [expectedId] : []
  if (visible.length !== expected.length || visible.some((id, index) => id !== expected[index])) {
    throw new Error(`Görünür native sekmeler beklenenden farklı: ${JSON.stringify(visible)}`)
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function waitUntil(check: () => boolean, timeout: number, message: string) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (check()) return
    await wait(25)
  }
  throw new Error(message)
}

async function waitUntilAsync(check: () => Promise<boolean>, timeout: number, message: string) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await wait(25)
  }
  throw new Error(message)
}
