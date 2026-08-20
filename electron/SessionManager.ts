import { app, session, type Session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  BrowserHistoryItem,
  BrowserSessionSnapshot,
  BrowserSessionTab,
} from '../shared/contracts.js'

interface PersistedBrowserState {
  session: BrowserSessionSnapshot
  history: BrowserHistoryItem[]
}

const MAX_SESSION_TABS = 32
const MAX_HISTORY_ITEMS = 2_000

function emptyState(): PersistedBrowserState {
  return { session: { tabs: [], activeTabId: null }, history: [] }
}

function safeRead(filePath: string): PersistedBrowserState {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PersistedBrowserState>
    const rawSession: { tabs?: unknown; activeTabId?: unknown } = parsed.session && typeof parsed.session === 'object'
      ? parsed.session as { tabs?: unknown; activeTabId?: unknown }
      : {}
    const rawTabs = Array.isArray((rawSession as { tabs?: unknown }).tabs)
      ? (rawSession as { tabs: unknown[] }).tabs
      : []
    const tabs = rawTabs.flatMap((value): BrowserSessionTab[] => {
      if (!value || typeof value !== 'object') return []
      const item = value as Partial<BrowserSessionTab>
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) return []
      const url = item.url === null || item.url === undefined
        ? null
        : typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
          ? item.url
          : null
      return [{
        id: item.id,
        url,
        title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Yeni Sekme',
        favicon: typeof item.favicon === 'string' ? item.favicon : null,
        pinned: item.pinned === true,
        muted: item.muted === true,
      }]
    }).slice(0, MAX_SESSION_TABS)
    const activeTabId = typeof rawSession.activeTabId === 'string' && tabs.some((tab) => tab.id === rawSession.activeTabId)
      ? rawSession.activeTabId
      : tabs[0]?.id ?? null
    const history = Array.isArray(parsed.history)
      ? parsed.history.flatMap((value): BrowserHistoryItem[] => {
        if (!value || typeof value !== 'object') return []
        const item = value as Partial<BrowserHistoryItem>
        if (typeof item.id !== 'string' || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) return []
        return [{
          id: item.id,
          url: item.url,
          title: typeof item.title === 'string' ? item.title : item.url,
          favicon: typeof item.favicon === 'string' ? item.favicon : null,
          visitedAt: typeof item.visitedAt === 'number' ? item.visitedAt : Date.now(),
        }]
      }).slice(0, MAX_HISTORY_ITEMS)
      : []
    return { session: { tabs, activeTabId }, history }
  } catch {
    return emptyState()
  }
}

export class SessionManager {
  readonly dataDir: string
  readonly profileDir: string
  private readonly statePath: string
  private state: PersistedBrowserState
  private flushTimer: NodeJS.Timeout | null = null
  private browserSession: Session | null = null

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'state')
    this.profileDir = path.join(this.dataDir, 'browser-profile')
    this.statePath = path.join(this.dataDir, 'browser-state.json')
    fs.mkdirSync(this.dataDir, { recursive: true })
    fs.mkdirSync(this.profileDir, { recursive: true })
    this.state = safeRead(this.statePath)
  }

  getBrowserSession(): Session {
    if (!this.browserSession) {
      this.browserSession = session.fromPartition('persist:kapanis-browser')
    }
    return this.browserSession
  }

  getSnapshot(): BrowserSessionSnapshot {
    return {
      tabs: this.state.session.tabs.map((tab) => ({ ...tab })),
      activeTabId: this.state.session.activeTabId,
    }
  }

  saveSnapshot(snapshot: BrowserSessionSnapshot) {
    const tabs = snapshot.tabs
      .filter((tab) => /^[A-Za-z0-9_-]{1,64}$/.test(tab.id))
      .slice(0, MAX_SESSION_TABS)
      .map((tab) => ({
        id: tab.id,
        url: tab.url && /^https?:\/\//i.test(tab.url) ? tab.url : null,
        title: tab.title.trim().slice(0, 512) || 'Yeni Sekme',
        favicon: typeof tab.favicon === 'string' ? tab.favicon : null,
        pinned: tab.pinned === true,
        muted: tab.muted === true,
      }))
    this.state.session = {
      tabs,
      activeTabId: snapshot.activeTabId && tabs.some((tab) => tab.id === snapshot.activeTabId)
        ? snapshot.activeTabId
        : tabs[0]?.id ?? null,
    }
    this.scheduleFlush()
  }

  addHistory(item: Omit<BrowserHistoryItem, 'id' | 'visitedAt'>) {
    if (!/^https?:\/\//i.test(item.url)) return
    const next: BrowserHistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      visitedAt: Date.now(),
    }
    this.state.history = [next, ...this.state.history.filter((entry) => entry.url !== item.url)].slice(0, MAX_HISTORY_ITEMS)
    this.scheduleFlush()
  }

  listHistory(limit = 200): BrowserHistoryItem[] {
    return this.state.history.slice(0, Math.max(1, Math.min(limit, MAX_HISTORY_ITEMS))).map((item) => ({ ...item }))
  }

  clearHistory() {
    this.state.history = []
    this.scheduleFlush()
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    const tempPath = `${this.statePath}.tmp`
    try {
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf8')
      fs.renameSync(tempPath, this.statePath)
    } catch (error) {
      try { fs.rmSync(tempPath, { force: true }) } catch { /* best effort */ }
      console.error('[session] state could not be persisted', error)
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 250)
  }
}
