import { app, shell, type DownloadItem, type Session, type WebContents } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { BrowserDownloadItem } from '../shared/contracts.js'

function safeFilename(value: string) {
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return normalized || `download-${Date.now()}`
}

export class DownloadManager {
  private readonly statePath: string
  private readonly items = new Map<string, BrowserDownloadItem>()
  private readonly active = new Map<string, DownloadItem>()
  private getTabId: ((webContents: WebContents) => string | null) | null = null
  private emitUpdate: ((item: BrowserDownloadItem) => void) | null = null

  constructor(dataDir: string) {
    this.statePath = path.join(dataDir, 'browser-downloads.json')
    this.read()
  }

  attach(
    browserSession: Session,
    getTabId: (webContents: WebContents) => string | null,
    emitUpdate: (item: BrowserDownloadItem) => void,
  ) {
    this.getTabId = getTabId
    this.emitUpdate = emitUpdate
    browserSession.on('will-download', (_event, item, webContents) => this.handleDownload(item, webContents))
  }

  list() {
    return [...this.items.values()].sort((a, b) => b.startedAt - a.startedAt).map((item) => ({ ...item }))
  }

  async open(id: string) {
    const item = this.items.get(id)
    if (!item) throw new Error('İndirme bulunamadı.')
    if (!fs.existsSync(item.path)) throw new Error('İndirilen dosya artık mevcut değil.')
    const error = await shell.openPath(item.path)
    if (error) throw new Error(error)
  }

  showInFolder(id: string) {
    const item = this.items.get(id)
    if (!item) throw new Error('İndirme bulunamadı.')
    shell.showItemInFolder(item.path)
  }

  cancel(id: string) {
    const active = this.active.get(id)
    if (!active) return false
    active.cancel()
    return true
  }

  remove(id: string) {
    const item = this.items.get(id)
    if (!item) return false
    this.active.get(id)?.cancel()
    this.active.delete(id)
    this.items.delete(id)
    this.flush()
    return true
  }

  flush() {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.list(), null, 2), 'utf8')
    } catch (error) {
      console.error('[downloads] state could not be persisted', error)
    }
  }

  private handleDownload(item: DownloadItem, webContents: WebContents) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const downloadDir = path.join(app.getPath('downloads'), 'kapanis')
    fs.mkdirSync(downloadDir, { recursive: true })
    const filename = safeFilename(item.getFilename())
    const savePath = uniquePath(path.join(downloadDir, filename))
    item.setSavePath(savePath)
    const record: BrowserDownloadItem = {
      id,
      tabId: this.getTabId?.(webContents) ?? null,
      url: item.getURL(),
      filename,
      path: savePath,
      state: 'progressing',
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
      completedAt: null,
      error: null,
    }
    this.items.set(id, record)
    this.active.set(id, item)
    this.emit(record)
    item.on('updated', (_event, state) => {
      const current = this.items.get(id)
      if (!current) return
      current.state = state === 'progressing' ? 'progressing' : 'interrupted'
      current.receivedBytes = item.getReceivedBytes()
      current.totalBytes = item.getTotalBytes()
      this.emit(current)
    })
    item.once('done', (_event, state) => {
      const current = this.items.get(id)
      this.active.delete(id)
      if (!current) return
      current.state = state === 'completed'
        ? 'completed'
        : state === 'cancelled'
          ? 'cancelled'
          : 'interrupted'
      current.receivedBytes = item.getReceivedBytes()
      current.totalBytes = item.getTotalBytes()
      current.completedAt = Date.now()
      current.error = state === 'completed' ? null : `İndirme durumu: ${state}`
      this.flush()
      this.emit(current)
    })
    this.flush()
  }

  private emit(item: BrowserDownloadItem) {
    this.emitUpdate?.({ ...item })
  }

  private read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return
      for (const value of parsed) {
        if (!value || typeof value !== 'object') continue
        const item = value as Partial<BrowserDownloadItem>
        if (typeof item.id !== 'string' || typeof item.url !== 'string' || typeof item.path !== 'string') continue
        if (!['progressing', 'completed', 'cancelled', 'interrupted'].includes(item.state || '')) continue
        this.items.set(item.id, {
          id: item.id,
          tabId: typeof item.tabId === 'string' ? item.tabId : null,
          url: item.url,
          filename: typeof item.filename === 'string' ? item.filename : path.basename(item.path),
          path: item.path,
          state: item.state as BrowserDownloadItem['state'],
          receivedBytes: typeof item.receivedBytes === 'number' ? item.receivedBytes : 0,
          totalBytes: typeof item.totalBytes === 'number' ? item.totalBytes : 0,
          startedAt: typeof item.startedAt === 'number' ? item.startedAt : Date.now(),
          completedAt: typeof item.completedAt === 'number' ? item.completedAt : null,
          error: typeof item.error === 'string' ? item.error : null,
        })
      }
    } catch { /* corrupt download state is treated as empty */ }
  }
}

function uniquePath(input: string) {
  if (!fs.existsSync(input)) return input
  const directory = path.dirname(input)
  const extension = path.extname(input)
  const stem = path.basename(input, extension)
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = path.join(directory, `${stem} (${index})${extension}`)
    if (!fs.existsSync(candidate)) return candidate
  }
  return path.join(directory, `${stem}-${Date.now()}${extension}`)
}

