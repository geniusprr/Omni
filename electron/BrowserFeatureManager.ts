import { BrowserWindow, dialog, type Extension, type Session } from 'electron'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { BrowserExtensionInfo, BrowserFeatureState } from '../shared/contracts.js'

interface StoredExtension {
  id: string
  path: string
  enabled: boolean
  source: 'store' | 'unpacked'
}

interface StoredFeatureState {
  adBlockEnabled: boolean
  extensions: StoredExtension[]
}

const DEFAULT_STATE: StoredFeatureState = {
  adBlockEnabled: true,
  extensions: [],
}

const STORE_EXTENSION_ID = /^[a-p]{32}$/

export class BrowserFeatureManager {
  private readonly browserSession: Session
  private readonly incognitoSession: Session
  private readonly mainWindow: BrowserWindow
  private readonly statePath: string
  private readonly extensionsDir: string
  private readonly blockerCachePath: string
  private state: StoredFeatureState
  private blocker: ElectronBlocker | null = null
  private blockerInit: Promise<void> | null = null
  private adBlockReady = false

  constructor(browserSession: Session, incognitoSession: Session, mainWindow: BrowserWindow, dataDir: string) {
    this.browserSession = browserSession
    this.incognitoSession = incognitoSession
    this.mainWindow = mainWindow
    this.statePath = path.join(dataDir, 'browser-features.json')
    this.extensionsDir = path.join(dataDir, 'browser-extensions')
    this.blockerCachePath = path.join(dataDir, 'adblock-engine.bin')
    fs.mkdirSync(this.extensionsDir, { recursive: true })
    this.state = this.readState()
  }

  async initialize() {
    // Extensions must be restored before the first browser page is created so
    // content scripts are present on the initial navigation as well.
    await this.restoreExtensions()
    // Filter-list refresh can involve network I/O. It must never hold the app's
    // IPC registration or first paint hostage; the blocker becomes ready in the
    // background and its state is exposed to the browser settings UI meanwhile.
    if (this.state.adBlockEnabled) void this.ensureBlocker()
  }

  getState(): BrowserFeatureState {
    const extensions = this.listExtensions()
    return {
      adBlockEnabled: this.state.adBlockEnabled,
      adBlockReady: this.adBlockReady,
      adBlockEngine: 'Ghostery · uBlock/EasyList uyumlu',
      extensionCount: extensions.filter((item) => item.enabled).length,
      extensions,
    }
  }

  async setAdBlockEnabled(enabled: boolean) {
    this.state.adBlockEnabled = enabled
    this.writeState()
    if (enabled) {
      await this.ensureBlocker()
    } else if (this.blocker) {
      if (this.blocker.isBlockingEnabled(this.browserSession)) {
        this.blocker.disableBlockingInSession(this.browserSession)
      }
      // Ghostery's Electron cosmetic-filter IPC handlers are process-global,
      // so a second full BlockingContext cannot be registered for incognito.
      // The private session still gets the same network filtering rules; only
      // cosmetic DOM injection is owned by the persistent browser session.
      this.incognitoSession.webRequest.onHeadersReceived(null)
      this.incognitoSession.webRequest.onBeforeRequest(null)
      this.adBlockReady = false
    }
    return this.getState()
  }

  async installFromStore(value: string) {
    const id = parseChromeWebStoreId(value)
    if (!id) throw new Error('Geçerli bir Chrome Web Mağazası bağlantısı veya eklenti kimliği girin.')

    const chromeVersion = process.versions.chrome || '142.0.0.0'
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(chromeVersion)}&acceptformat=crx2,crx3&x=id%3D${id}%26uc`
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) throw new Error(`Chrome Web Mağazası eklentisi indirilemedi (${response.status}).`)
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > 64 * 1024 * 1024) throw new Error('Chrome eklenti paketi izin verilen indirme boyutunu aşıyor.')
    const crx = Buffer.from(await response.arrayBuffer())
    if (crx.length > 64 * 1024 * 1024) throw new Error('Chrome eklenti paketi izin verilen indirme boyutunu aşıyor.')
    const zip = extractCrxZip(crx)

    const destination = path.join(this.extensionsDir, `store-${id}`)
    this.assertManagedPath(destination)
    fs.rmSync(destination, { recursive: true, force: true })
    fs.mkdirSync(destination, { recursive: true })
    try {
      await extractZipSafely(zip, destination)
      const extension = await this.browserSession.extensions.loadExtension(destination)
      this.upsertStoredExtension({ id: extension.id, path: destination, enabled: true, source: 'store' })
      return this.toInfo(extension, true, 'store')
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true })
      throw error
    }
  }

  async installUnpacked() {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Paketlenmemiş Chrome eklentisini seç',
      properties: ['openDirectory'],
      buttonLabel: 'Eklentiyi yükle',
    })
    if (result.canceled || !result.filePaths[0]) return null
    const source = result.filePaths[0]
    const manifestPath = path.join(source, 'manifest.json')
    if (!fs.existsSync(manifestPath)) throw new Error('Seçilen klasörde manifest.json bulunamadı.')

    const folderName = `local-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const destination = path.join(this.extensionsDir, folderName)
    this.assertManagedPath(destination)
    fs.cpSync(source, destination, { recursive: true, force: true })
    try {
      const extension = await this.browserSession.extensions.loadExtension(destination)
      this.upsertStoredExtension({ id: extension.id, path: destination, enabled: true, source: 'unpacked' })
      return this.toInfo(extension, true, 'unpacked')
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true })
      throw error
    }
  }

  async setExtensionEnabled(id: string, enabled: boolean) {
    const stored = this.state.extensions.find((item) => item.id === id)
    if (!stored) throw new Error('Eklenti bulunamadı.')
    if (enabled) {
      if (!fs.existsSync(stored.path)) throw new Error('Eklenti dosyaları bulunamadı.')
      const extension = await this.browserSession.extensions.loadExtension(stored.path)
      stored.id = extension.id
      stored.enabled = true
    } else {
      this.browserSession.extensions.removeExtension(id)
      stored.enabled = false
    }
    this.writeState()
    return this.getState()
  }

  removeExtension(id: string) {
    const index = this.state.extensions.findIndex((item) => item.id === id)
    if (index < 0) return this.getState()
    const [stored] = this.state.extensions.splice(index, 1)
    try { this.browserSession.extensions.removeExtension(id) } catch { /* already unloaded */ }
    this.assertManagedPath(stored.path)
    fs.rmSync(stored.path, { recursive: true, force: true })
    this.writeState()
    return this.getState()
  }

  async openExtensionOptions(id: string) {
    const stored = this.state.extensions.find((item) => item.id === id)
    const extension = this.browserSession.extensions.getExtension(id)
    if (!stored || !extension) throw new Error('Eklenti etkin değil.')
    const manifest = extension.manifest as Record<string, any>
    const page = typeof manifest.options_page === 'string'
      ? manifest.options_page
      : typeof manifest.options_ui?.page === 'string'
        ? manifest.options_ui.page
        : null
    if (!page) throw new Error('Bu eklentinin bir ayarlar sayfası yok.')
    const optionsWindow = new BrowserWindow({
      width: 920,
      height: 700,
      minWidth: 640,
      minHeight: 480,
      parent: this.mainWindow,
      autoHideMenuBar: true,
      backgroundColor: '#111111',
      webPreferences: {
        session: this.browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    await optionsWindow.loadURL(new URL(page, extension.url).toString())
  }

  async clearBrowsingData(scope: 'cache' | 'cookies' | 'all') {
    if (scope === 'cache') {
      await this.browserSession.clearCache()
      return
    }
    if (scope === 'cookies') {
      await this.browserSession.clearStorageData({ storages: ['cookies'] })
      return
    }
    await Promise.all([
      this.browserSession.clearCache(),
      this.browserSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'filesystem', 'serviceworkers', 'cachestorage'],
      }),
    ])
  }

  private async ensureBlocker() {
    if (this.blocker && this.adBlockReady) return
    if (this.blockerInit) return this.blockerInit
    this.blockerInit = (async () => {
      try {
        const blocker = this.blocker ?? await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
          path: this.blockerCachePath,
          read: fs.promises.readFile,
          write: fs.promises.writeFile,
        })
        if (!this.state.adBlockEnabled) return
        blocker.enableBlockingInSession(this.browserSession)
        this.incognitoSession.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, blocker.onHeadersReceived)
        this.incognitoSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, blocker.onBeforeRequest)
        this.blocker = blocker
        this.adBlockReady = true
      } catch (error) {
        this.adBlockReady = false
        console.error('[browser] ad blocker initialization failed', error)
      } finally {
        this.blockerInit = null
      }
    })()
    return this.blockerInit
  }

  private async restoreExtensions() {
    let changed = false
    for (const stored of this.state.extensions) {
      if (!stored.enabled) continue
      if (!fs.existsSync(stored.path)) {
        stored.enabled = false
        changed = true
        continue
      }
      try {
        const extension = await this.browserSession.extensions.loadExtension(stored.path)
        if (extension.id !== stored.id) {
          stored.id = extension.id
          changed = true
        }
      } catch (error) {
        stored.enabled = false
        changed = true
        console.error(`[browser] extension restore failed: ${stored.id}`, error)
      }
    }
    if (changed) this.writeState()
  }

  private listExtensions(): BrowserExtensionInfo[] {
    return this.state.extensions.flatMap((stored) => {
      const extension = this.browserSession.extensions.getExtension(stored.id)
      if (extension) return [this.toInfo(extension, stored.enabled, stored.source)]
      const manifest = readManifest(stored.path)
      if (!manifest) return []
      return [{
        id: stored.id,
        name: typeof manifest.name === 'string' ? manifest.name : stored.id,
        version: typeof manifest.version === 'string' ? manifest.version : '',
        description: typeof manifest.description === 'string' ? manifest.description : '',
        enabled: false,
        source: stored.source,
        hasOptions: Boolean(manifest.options_page || manifest.options_ui?.page),
      }]
    })
  }

  private toInfo(extension: Extension, enabled: boolean, source: 'store' | 'unpacked'): BrowserExtensionInfo {
    const manifest = extension.manifest as Record<string, any>
    return {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      description: typeof manifest.description === 'string' ? manifest.description : '',
      enabled,
      source,
      hasOptions: Boolean(manifest.options_page || manifest.options_ui?.page),
    }
  }

  private upsertStoredExtension(extension: StoredExtension) {
    const existingIndex = this.state.extensions.findIndex((item) => item.id === extension.id || item.path === extension.path)
    if (existingIndex >= 0) this.state.extensions[existingIndex] = extension
    else this.state.extensions.push(extension)
    this.writeState()
  }

  private readState(): StoredFeatureState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<StoredFeatureState>
      const extensions = Array.isArray(parsed.extensions)
        ? parsed.extensions.filter((item): item is StoredExtension => Boolean(
          item
          && typeof item.id === 'string'
          && typeof item.path === 'string'
          && (item.source === 'store' || item.source === 'unpacked'),
        )).map((item) => ({ ...item, enabled: item.enabled !== false }))
        : []
      return {
        adBlockEnabled: parsed.adBlockEnabled !== false,
        extensions,
      }
    } catch {
      return { ...DEFAULT_STATE, extensions: [] }
    }
  }

  private writeState() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8')
  }

  private assertManagedPath(target: string) {
    const relative = path.relative(this.extensionsDir, path.resolve(target))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Geçersiz eklenti klasörü.')
    }
  }
}

function parseChromeWebStoreId(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (STORE_EXTENSION_ID.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (!/(^|\.)chromewebstore\.google\.com$/i.test(url.hostname)) return null
    return url.pathname.split('/').find((part) => STORE_EXTENSION_ID.test(part)) ?? null
  } catch {
    return null
  }
}

function extractCrxZip(buffer: Buffer) {
  if (buffer.length < 4) throw new Error('Eklenti paketi boş veya bozuk.')
  if (buffer.subarray(0, 2).toString('binary') === 'PK') return buffer
  if (buffer.subarray(0, 4).toString('ascii') !== 'Cr24' || buffer.length < 16) {
    throw new Error('Chrome eklenti paketi tanınamadı.')
  }
  const version = buffer.readUInt32LE(4)
  let start = 0
  if (version === 2) {
    const publicKeyLength = buffer.readUInt32LE(8)
    const signatureLength = buffer.readUInt32LE(12)
    start = 16 + publicKeyLength + signatureLength
  } else if (version === 3) {
    const headerLength = buffer.readUInt32LE(8)
    start = 12 + headerLength
  } else {
    throw new Error(`Desteklenmeyen CRX sürümü: ${version}`)
  }
  if (start < 0 || start >= buffer.length || buffer.subarray(start, start + 2).toString('binary') !== 'PK') {
    throw new Error('CRX içindeki ZIP verisi okunamadı.')
  }
  return buffer.subarray(start)
}

function readManifest(extensionPath: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8')) as Record<string, any>
  } catch {
    return null
  }
}

async function extractZipSafely(buffer: Buffer, destination: string) {
  const zipFile = await new Promise<ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    }, (error, archive) => {
      if (error || !archive) reject(error || new Error('ZIP paketi açılamadı.'))
      else resolve(archive)
    })
  })

  const MAX_ENTRY_SIZE = 64 * 1024 * 1024
  const MAX_TOTAL_SIZE = 256 * 1024 * 1024
  const MAX_ENTRIES = 10_000
  let totalSize = 0
  let entryCount = 0

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      try { zipFile.close() } catch { /* best effort */ }
      reject(error instanceof Error ? error : new Error('Eklenti arşivi açılamadı.'))
    }

    zipFile.once('error', fail)
    zipFile.once('end', () => {
      if (settled) return
      settled = true
      resolve()
    })
    zipFile.on('entry', (entry) => {
      void (async () => {
        entryCount += 1
        if (entryCount > MAX_ENTRIES) throw new Error('Eklenti arşivinde çok fazla dosya var.')
        if (entry.fileName.length > 2048) throw new Error('Eklenti arşivinde geçersiz dosya adı var.')

        const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff
        if ((unixMode & 0xf000) === 0xa000) throw new Error('Sembolik bağlantı içeren eklenti paketleri güvenlik nedeniyle yüklenemez.')
        if (entry.uncompressedSize > MAX_ENTRY_SIZE) throw new Error('Eklenti paketindeki bir dosya izin verilen boyutu aşıyor.')
        totalSize += entry.uncompressedSize
        if (totalSize > MAX_TOTAL_SIZE) throw new Error('Eklenti paketi açıldığında izin verilen toplam boyutu aşıyor.')

        const target = safeArchiveTarget(destination, entry.fileName)
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(target, { recursive: true })
          zipFile.readEntry()
          return
        }

        fs.mkdirSync(path.dirname(target), { recursive: true })
        const stream = await openZipEntry(zipFile, entry)
        await pipeline(stream, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }))
        zipFile.readEntry()
      })().catch(fail)
    })
    zipFile.readEntry()
  })
}

function openZipEntry(zipFile: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error || new Error('Eklenti dosyası okunamadı.'))
      else resolve(stream)
    })
  })
}

function safeArchiveTarget(root: string, rawName: string) {
  const normalized = rawName.replace(/\\/g, '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Eklenti arşivinde güvenli olmayan bir dosya yolu var.')
  }
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.')
  if (segments.some((segment) => segment === '..')) throw new Error('Eklenti arşivinde dizin geçişi tespit edildi.')
  const base = path.resolve(root)
  const target = path.resolve(base, ...segments)
  const relative = path.relative(base, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Eklenti arşivinde geçersiz bir hedef yolu var.')
  }
  return target
}
