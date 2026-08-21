import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray,
  type BrowserWindowConstructorOptions,
} from 'electron'
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ProgramCandidate } from '../shared/contracts.js'

const execFileAsync = promisify(execFile)
const PROGRAM_EXTENSIONS = new Set(['.exe', '.com', '.lnk'])
const PROGRAM_INDEX_TTL_MS = 15 * 60 * 1_000
const PROGRAM_INDEX_LIMIT = 400

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && !/[\s\u0000-\u001f]/.test(value)
  } catch {
    return false
  }
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private splashWindow: BrowserWindow | null = null
  private splashTimer: NodeJS.Timeout | null = null
  private tray: Tray | null = null
  private allowClose = false
  private rendererUrl: string | null = null
  private programIndex: { createdAt: number; items: ProgramCandidate[] } | null = null
  private readonly preloadPath: string

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath
  }

  createMainWindow(rendererUrl: string) {
    this.rendererUrl = rendererUrl
    const options: BrowserWindowConstructorOptions = {
      width: 1180,
      height: 740,
      minWidth: 320,
      minHeight: 500,
      title: 'kapanış.',
      show: false,
      frame: false,
      transparent: false,
      backgroundColor: '#111722',
      center: true,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        spellcheck: true,
      },
    }
    const window = new BrowserWindow(options)
    this.mainWindow = window
    window.on('close', (event) => {
      if (!this.allowClose) {
        event.preventDefault()
        this.hideToTray()
      }
    })
    window.on('closed', () => {
      this.mainWindow = null
    })
    window.webContents.on('did-finish-load', () => {
      if (this.splashWindow) this.finishSplash()
      if (!this.splashWindow && !app.commandLine.hasSwitch('background')) window.showInactive()
    })
    window.webContents.on('did-fail-load', (_event, errorCode, description, validatedURL, isMainFrame) => {
      if (isMainFrame) console.error('[window] renderer did-fail-load', { errorCode, description, validatedURL })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      console.error('[window] renderer process gone', details)
    })
    void window.loadURL(rendererUrl).catch((error) => {
      console.error('[window] renderer could not load', error)
    })
    return window
  }

  createSplash(rendererUrl: string) {
    if (app.commandLine.hasSwitch('background')) return
    if (this.splashTimer) clearTimeout(this.splashTimer)
    this.splashWindow = new BrowserWindow({
      width: 380,
      height: 240,
      title: 'kapanış.',
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      closable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      center: true,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    const splash = this.splashWindow
    const showSplash = () => {
      if (!splash.isDestroyed() && !splash.isVisible()) splash.show()
    }
    splash.once('ready-to-show', showSplash)
    splash.webContents.once('did-finish-load', showSplash)
    splash.on('closed', () => {
      if (this.splashWindow === splash) this.splashWindow = null
    })
    const splashTarget = rendererUrl.startsWith('file:')
      ? pathToSplashFile(rendererUrl)
      : `${rendererUrl.replace(/\/$/, '')}/splash.html`
    if (splashTarget.startsWith('http:') || splashTarget.startsWith('https:')) {
      void splash.loadURL(splashTarget).catch(() => undefined)
    } else {
      void splash.loadFile(splashTarget).catch(() => undefined)
    }
    this.splashTimer = setTimeout(() => this.finishSplash(), 5_000)
    this.splashTimer.unref?.()
  }

  finishSplash() {
    if (this.splashTimer) {
      clearTimeout(this.splashTimer)
      this.splashTimer = null
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (!app.commandLine.hasSwitch('background')) this.mainWindow.show()
    }
    const splash = this.splashWindow
    this.splashWindow = null
    if (splash && !splash.isDestroyed()) {
      try { splash.hide() } catch { /* best effort */ }
      // The splash is a non-interactive startup surface. destroy() avoids the
      // native close-to-tray handler and guarantees the window cannot linger.
      try { splash.destroy() } catch { /* best effort */ }
    }
  }

  getMainWindow() {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  showMain() {
    const window = this.getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  hideToTray() {
    this.getMainWindow()?.hide()
  }

  minimize() {
    this.getMainWindow()?.minimize()
  }

  toggleMaximize() {
    const window = this.getMainWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  }

  isMaximized() {
    return this.getMainWindow()?.isMaximized() ?? false
  }

  close() {
    // Keep the existing kapanış. close-to-tray behavior. The tray's Quit action
    // sets app.isQuitting and lets the normal close path destroy every renderer.
    this.hideToTray()
  }

  quit() {
    this.allowClose = true
    app.quit()
  }

  allowCloseOnQuit() {
    this.allowClose = true
  }

  setFullscreen(fullscreen: boolean) {
    this.getMainWindow()?.setFullScreen(fullscreen)
  }

  isFullscreen() {
    return this.getMainWindow()?.isFullScreen() ?? false
  }

  async openExternal(value: string) {
    const url = value.trim()
    if (!isHttpUrl(url)) throw new Error('Yalnızca geçerli http veya https bağlantıları açılabilir.')
    await shell.openExternal(url)
  }

  async launchProgram(value: string) {
    const input = value.trim()
    if (!path.isAbsolute(input)) throw new Error('Program yolu tam dosya yolu olmalı.')
    const resolved = path.resolve(input)
    if (!await fileExists(resolved)) throw new Error('Program dosyası bulunamadı.')
    if (process.platform === 'win32' && !isProgramPath(resolved)) {
      throw new Error('Windows hızlı erişimi .exe, .com veya .lnk dosyalarını destekler.')
    }
    const error = await shell.openPath(resolved)
    if (error) throw new Error(error)
  }

  async listPrograms(refresh = false): Promise<ProgramCandidate[]> {
    if (process.platform !== 'win32') return []

    const now = Date.now()
    if (!refresh && this.programIndex && now - this.programIndex.createdAt < PROGRAM_INDEX_TTL_MS) {
      return this.programIndex.items
    }

    const [startMenuPrograms, appPathPrograms] = await Promise.all([
      listStartMenuPrograms(),
      listAppPathPrograms(),
    ])
    const items = uniquePrograms([...startMenuPrograms, ...appPathPrograms])
    this.programIndex = { createdAt: now, items }
    return items
  }

  async pickProgram(): Promise<ProgramCandidate | null> {
    if (process.platform !== 'win32') return null

    const options = {
      title: 'Hızlı erişime program ekle',
      buttonLabel: 'Programı seç',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'Programlar', extensions: ['exe', 'com', 'lnk'] }],
    }
    const window = this.getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const selectedPath = result.filePaths[0]
    if (result.canceled || !selectedPath) return null

    const resolved = path.resolve(selectedPath)
    if (!isProgramPath(resolved) || !await fileExists(resolved)) {
      throw new Error('Seçilen dosya desteklenen bir Windows programı değil.')
    }

    return {
      name: programLabel(resolved),
      path: resolved,
      source: 'manual',
    }
  }

  configureTray(onQuit: () => void) {
    if (this.tray) return
    const iconPath = path.join(app.getAppPath(), 'app-icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    this.tray.setToolTip('kapanış.')
    const menu = Menu.buildFromTemplate([
      { label: 'Aç', click: () => this.showMain() },
      { type: 'separator' },
      { label: 'Çık', click: onQuit },
    ])
    this.tray.setContextMenu(menu)
    this.tray.on('click', () => this.showMain())
  }

  setWindowMode(mode: 'notes' | 'compact') {
    const window = this.getMainWindow()
    if (!window) return
    window.setResizable(true)
    window.setMaximizable(true)
    if (mode === 'notes') {
      const [width, height] = window.getContentSize()
      if (width < 1100 || height < 700) window.setSize(1200, 760)
    }
  }
}

async function fileExists(value: string) {
  try {
    const fs = await import('node:fs/promises')
    await fs.access(value)
    return true
  } catch {
    return false
  }
}

function isProgramPath(value: string) {
  return PROGRAM_EXTENSIONS.has(path.extname(value).toLowerCase())
}

function programLabel(value: string) {
  const name = path.basename(value, path.extname(value)).replace(/[._-]+/g, ' ').trim()
  return name || 'Program'
}

async function listStartMenuPrograms(): Promise<ProgramCandidate[]> {
  const roots = [
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.ProgramData
      ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : null,
  ].filter((root): root is string => Boolean(root))

  const candidates: ProgramCandidate[] = []
  for (const root of new Set(roots)) {
    await scanStartMenuDirectory(root, candidates)
    if (candidates.length >= PROGRAM_INDEX_LIMIT) break
  }
  return candidates
}

async function scanStartMenuDirectory(directory: string, candidates: ProgramCandidate[], depth = 0): Promise<void> {
  if (depth > 4 || candidates.length >= PROGRAM_INDEX_LIMIT) return
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (candidates.length >= PROGRAM_INDEX_LIMIT) return
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await scanStartMenuDirectory(entryPath, candidates, depth + 1)
      continue
    }
    if (!entry.isFile() || !isProgramPath(entry.name)) continue
    candidates.push({
      name: programLabel(entry.name),
      path: entryPath,
      source: 'start-menu',
    })
  }
}

async function listAppPathPrograms(): Promise<ProgramCandidate[]> {
  const roots = [
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  ]
  const outputs = await Promise.all(roots.map(async (root) => {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', root, '/s', '/ve'], {
        windowsHide: true,
        timeout: 8_000,
        maxBuffer: 2 * 1024 * 1024,
      })
      return String(stdout)
    } catch {
      return ''
    }
  }))

  const candidates: ProgramCandidate[] = []
  for (const output of outputs) {
    let currentKey = ''
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith('HKEY_')) {
        currentKey = trimmed
        continue
      }
      const match = trimmed.match(/^\(Default\)\s+REG_\w+\s+(.+)$/i)
      if (!match) continue
      const candidatePath = extractProgramPath(match[1])
      if (!candidatePath || !isProgramPath(candidatePath) || !await fileExists(candidatePath)) continue
      candidates.push({
        name: programLabel(currentKey || candidatePath),
        path: candidatePath,
        source: 'app-paths',
      })
      if (candidates.length >= PROGRAM_INDEX_LIMIT) return candidates
    }
  }
  return candidates
}

function extractProgramPath(value: string) {
  const trimmed = value.trim()
  const quoted = trimmed.match(/^"([^"\r\n]+\.(?:exe|com|lnk))"/i)
  if (quoted) return quoted[1]
  const unquoted = trimmed.match(/^(.+?\.(?:exe|com|lnk))(?:\s|$)/i)
  return unquoted?.[1]?.trim() || null
}

function uniquePrograms(candidates: ProgramCandidate[]) {
  const seenPaths = new Set<string>()
  return candidates
    .filter((candidate) => {
      const key = path.normalize(candidate.path).toLocaleLowerCase('tr-TR')
      if (seenPaths.has(key)) return false
      seenPaths.add(key)
      return true
    })
    .sort((left, right) => {
      const sourceOrder = programSourceOrder(left.source) - programSourceOrder(right.source)
      return sourceOrder || left.name.localeCompare(right.name, 'tr-TR', { sensitivity: 'base' })
    })
    .slice(0, PROGRAM_INDEX_LIMIT)
}

function programSourceOrder(source: ProgramCandidate['source']) {
  return source === 'start-menu' ? 0 : source === 'app-paths' ? 1 : 2
}

function pathToSplashFile(rendererUrl: string) {
  try {
    const filePath = fileURLToPath(rendererUrl)
    return path.basename(filePath).toLowerCase() === 'splash.html'
      ? filePath
      : path.join(path.dirname(filePath), 'splash.html')
  } catch {
    return rendererUrl
  }
}
