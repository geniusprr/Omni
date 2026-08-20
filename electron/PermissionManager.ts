import fs from 'node:fs'
import path from 'node:path'
import type { Session, WebContents } from 'electron'
import type {
  BrowserPermission,
  BrowserPermissionRecord,
  BrowserPermissionRequest,
  PermissionSetInput,
} from '../shared/contracts.js'

interface PendingPermission {
  request: BrowserPermissionRequest
  callback: (allowed: boolean) => void
  timeout: NodeJS.Timeout
}

export class PermissionManager {
  private readonly statePath: string
  private readonly records = new Map<string, BrowserPermissionRecord>()
  private readonly pending = new Map<string, PendingPermission>()
  private emitRequest: ((request: BrowserPermissionRequest) => void) | null = null

  constructor(dataDir: string) {
    this.statePath = path.join(dataDir, 'browser-permissions.json')
    this.read()
  }

  attach(browserSession: Session, emitRequest: (request: BrowserPermissionRequest) => void) {
    this.emitRequest = emitRequest
    browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const origin = this.originFor(webContents, details?.requestingUrl)
      const decision = this.records.get(this.key(origin, permission))?.decision
      if (decision === 'allow') {
        callback(true)
        return
      }
      if (decision === 'deny') {
        callback(false)
        return
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const request: BrowserPermissionRequest = {
        requestId,
        tabId: this.tabIdFor(webContents),
        origin,
        permission,
        createdAt: Date.now(),
      }
      const timeout = setTimeout(() => {
        const current = this.pending.get(requestId)
        if (!current) return
        this.pending.delete(requestId)
        current.callback(false)
      }, 30_000)
      this.pending.set(requestId, { request, callback, timeout })
      emitRequest(request)
    })
    browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      const origin = this.originFor(webContents, requestingOrigin)
      return this.records.get(this.key(origin, permission))?.decision === 'allow'
    })
  }

  setDecision(input: PermissionSetInput) {
    if (!/^https?:\/\//i.test(input.origin)) throw new Error('İzin kaydı için geçerli bir site kökeni gerekli.')
    const key = this.key(input.origin, input.permission)
    if (input.decision === 'ask') this.records.delete(key)
    else this.records.set(key, {
      origin: input.origin,
      permission: input.permission,
      decision: input.decision,
      updatedAt: Date.now(),
    })
    this.flush()
    if (input.requestId) {
      const pending = this.pending.get(input.requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pending.delete(input.requestId)
        pending.callback(input.decision === 'allow')
      }
    }
  }

  clear(origin?: string, permission?: BrowserPermission) {
    if (!origin && !permission) this.records.clear()
    else {
      for (const [key, value] of this.records) {
        if ((!origin || value.origin === origin) && (!permission || value.permission === permission)) this.records.delete(key)
      }
    }
    this.flush()
  }

  list(): BrowserPermissionRecord[] {
    return [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((record) => ({ ...record }))
  }

  cancelPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.callback(false)
    }
    this.pending.clear()
  }

  cancelForTab(tabId: string) {
    for (const [requestId, pending] of this.pending) {
      if (pending.request.tabId !== tabId) continue
      clearTimeout(pending.timeout)
      pending.callback(false)
      this.pending.delete(requestId)
    }
  }

  private tabIdFor(webContents: WebContents) {
    return (webContents as WebContents & { kapanisTabId?: string }).kapanisTabId ?? null
  }

  private originFor(webContents: WebContents | null, requestingUrl?: string) {
    try {
      const value = requestingUrl || webContents?.getURL() || ''
      return new URL(value).origin
    } catch {
      return 'null'
    }
  }

  private key(origin: string, permission: string) {
    return `${origin}\u0000${permission}`
  }

  private read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return
      for (const value of parsed) {
        if (!value || typeof value !== 'object') continue
        const item = value as Partial<BrowserPermissionRecord>
        if (typeof item.origin !== 'string' || typeof item.permission !== 'string') continue
        if (item.decision !== 'allow' && item.decision !== 'deny') continue
        this.records.set(this.key(item.origin, item.permission), {
          origin: item.origin,
          permission: item.permission,
          decision: item.decision,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        })
      }
    } catch { /* corrupt permission state is treated as empty */ }
  }

  private flush() {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify([...this.records.values()], null, 2), 'utf8')
    } catch (error) {
      console.error('[permissions] state could not be persisted', error)
    }
  }
}
