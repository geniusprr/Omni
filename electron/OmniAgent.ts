import { randomUUID } from 'node:crypto'
import type { AlarmManager } from './AlarmManager.js'
import type { BrowserManager } from './BrowserManager.js'
import type { ContentManager } from './ContentManager.js'
import type { LocalSendManager } from './LocalSendManager.js'
import type { NotificationListenerManager } from './NotificationListenerManager.js'
import type { RemoteDesktopManager } from './RemoteDesktopManager.js'
import type { SystemManager } from './SystemManager.js'
import type { WindowManager } from './WindowManager.js'

export type OmniTheme = 'light' | 'obsidian' | 'rose' | 'violet' | 'ocean'
export type OmniWorkspace = 'home' | 'browser' | 'ai' | 'calendar' | 'power' | 'alarms' | 'notes' | 'localsend' | 'remote' | 'settings'

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AgentToolActivity {
  id: string
  tool: string
  label: string
  status: 'running' | 'success' | 'error'
  detail: string
  createdAt: number
}

export interface AgentToolRuntime {
  readonly tools: readonly AgentToolDefinition[]
  readonly systemPrompt: string
  execute(name: string, args: Record<string, unknown>): Promise<unknown>
}

interface OmniAgentOptions {
  windows: WindowManager
  browser: BrowserManager
  alarms: AlarmManager
  system: SystemManager
  content: ContentManager
  localSend: LocalSendManager
  remoteDesktop: RemoteDesktopManager
  getNotifications: () => NotificationListenerManager | null
  setTheme: (theme: OmniTheme) => void
  openWorkspace: (workspace: OmniWorkspace) => void
  openBrowser: (query: string) => void
  onActivity?: (activity: AgentToolActivity) => void
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
})

const ACTION = (values: string[], description?: string) => ({ type: 'string', enum: values, ...(description ? { description } : {}) })

export const OMNI_AGENT_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'app_theme',
    description: 'Eon uygulamasının temasını değiştirir. Kullanıcı tema adını belirtmediyse bu aracı çağırma; önce Light, Obsidian, Rose, Violet veya Ocean seçeneklerinden hangisini istediğini sor.',
    parameters: objectSchema({ theme: ACTION(['light', 'obsidian', 'rose', 'violet', 'ocean'], 'Seçilecek kesin tema.') }, ['theme']),
  },
  {
    name: 'app_workspace',
    description: 'Eon içinde belirtilen çalışma alanını açar.',
    parameters: objectSchema({ workspace: ACTION(['home', 'browser', 'ai', 'calendar', 'power', 'alarms', 'notes', 'localsend', 'remote', 'settings']) }, ['workspace']),
  },
  {
    name: 'browser',
    description: 'Eon tarayıcısını kontrol eder. open yeni bir URL/arama açar; navigate aktif sekmeyi değiştirir; list_tabs açık sekmeleri döndürür.',
    parameters: objectSchema({
      action: ACTION(['open', 'navigate', 'list_tabs', 'reload', 'back', 'forward']),
      query: { type: 'string', description: 'URL veya arama metni. open/navigate için gerekir.' },
    }, ['action']),
  },
  {
    name: 'notes',
    description: 'Hızlı notları listeler, oluşturur, günceller, siler veya sabitler. Silme yalnızca kullanıcı açıkça isterse yapılmalıdır.',
    parameters: objectSchema({
      action: ACTION(['list', 'create', 'update', 'delete', 'toggle_pin']),
      id: { type: 'string' },
      content: { type: 'string' },
      pinned: { type: 'boolean' },
    }, ['action']),
  },
  {
    name: 'alarms',
    description: 'Alarmları listeler, yeni alarm kurar veya iptal eder. create için delaySeconds gelecekteki süreyi saniye cinsinden belirtir.',
    parameters: objectSchema({
      action: ACTION(['list', 'create', 'cancel']),
      id: { type: 'string' },
      delaySeconds: { type: 'integer', minimum: 1, maximum: 315360000 },
      note: { type: 'string' },
      soundEnabled: { type: 'boolean' },
      soundProfile: ACTION(['gentle', 'chime', 'urgent']),
    }, ['action']),
  },
  {
    name: 'power',
    description: 'Windows kapatma/yeniden başlatma zamanlayıcısını okur, planlar veya iptal eder. schedule yalnızca kullanıcı açıkça istediğinde kullanılmalıdır.',
    parameters: objectSchema({
      action: ACTION(['status', 'schedule', 'cancel']),
      powerAction: ACTION(['shutdown', 'restart']),
      delaySeconds: { type: 'integer', minimum: 1, maximum: 315360000 },
    }, ['action']),
  },
  {
    name: 'media',
    description: 'Şu anki medya oturumunu veya YouTube Music oynatımını kontrol eder.',
    parameters: objectSchema({
      action: ACTION(['status', 'play_pause', 'next', 'previous', 'youtube_play_pause', 'youtube_next', 'youtube_previous', 'youtube_mute', 'youtube_volume']),
      volume: { type: 'number', minimum: 0, maximum: 1 },
    }, ['action']),
  },
  {
    name: 'localsend',
    description: 'Yerel cihazları listeler, metin yollar, tarama başlatır, otomatik kabulü değiştirir veya indirme klasörünü açar.',
    parameters: objectSchema({
      action: ACTION(['status', 'devices', 'scan', 'send_text', 'set_auto_accept', 'open_downloads']),
      targetIp: { type: 'string' },
      targetPort: { type: 'integer', minimum: 1, maximum: 65535 },
      text: { type: 'string' },
      enabled: { type: 'boolean' },
    }, ['action']),
  },
  {
    name: 'vault',
    description: 'Eon Markdown vault dosyalarını listeler, okur, yazar, oluşturur, yeniden adlandırır, siler veya Explorer’da gösterir. delete yalnızca kullanıcı açıkça isterse kullanılmalıdır.',
    parameters: objectSchema({
      action: ACTION(['default_path', 'list', 'read', 'write', 'create_file', 'create_folder', 'rename', 'delete', 'reveal']),
      vaultPath: { type: 'string' },
      path: { type: 'string' },
      newPath: { type: 'string' },
      content: { type: 'string' },
    }, ['action']),
  },
  {
    name: 'transfers',
    description: 'Eon aktarım kayıtlarını listeler, dosyayı açar, Explorer’da gösterir veya kaydı siler.',
    parameters: objectSchema({
      action: ACTION(['list', 'open', 'show', 'delete']),
      id: { type: 'string' },
      path: { type: 'string' },
    }, ['action']),
  },
  {
    name: 'system',
    description: 'Bilgisayar bilgisi, otomatik başlatma ve pencere kontrollerini yönetir.',
    parameters: objectSchema({
      action: ACTION(['info', 'autostart_status', 'autostart_set', 'minimize', 'toggle_maximize', 'show']),
      enabled: { type: 'boolean' },
    }, ['action']),
  },
  {
    name: 'remote',
    description: 'Uzak masaüstü durumunu okur, özelliği açıp kapatır, aktif oturumu durdurur veya güvenilen cihazları listeler.',
    parameters: objectSchema({
      action: ACTION(['status', 'set_enabled', 'stop_session', 'trusted_devices']),
      enabled: { type: 'boolean' },
    }, ['action']),
  },
  {
    name: 'notifications',
    description: 'Bildirim dinleyicisinin durumunu ve geçmişini okur veya kullanıcı açıkça istediğinde test bildirimi gönderir.',
    parameters: objectSchema({
      action: ACTION(['status', 'history', 'test']),
      title: { type: 'string' },
      body: { type: 'string' },
    }, ['action']),
  },
  {
    name: 'programs',
    description: 'Yüklü programları listeler veya kullanıcı açıkça istediğinde seçilen programı başlatır.',
    parameters: objectSchema({
      action: ACTION(['list', 'launch']),
      path: { type: 'string' },
      refresh: { type: 'boolean' },
    }, ['action']),
  },
] as const

const SYSTEM_PROMPT = `Sen Eon'nin uygulama içi ajanısın. Sohbet etmekle kalmaz, gerektiğinde sağlanan araçlarla uygulamayı gerçekten kontrol edersin.

Kurallar:
- Kullanıcı bir uygulama işlemini açıkça istiyorsa uygun aracı çağır ve sonucu doğrula; yapılmamış bir şeyi yapılmış gibi söyleme.
- Eksik zorunlu bilgi varsa tahmin etme, kısa bir netleştirme sorusu sor. Özellikle kullanıcı sadece “temayı değiştir” derse araç çağırmadan önce hangi tema olduğunu sor: Light, Obsidian, Rose, Violet veya Ocean.
- Silme, kapatma/yeniden başlatma, program başlatma gibi etkili işlemleri yalnızca açık kullanıcı isteğiyle yap.
- Araç sonucu hata döndürürse hatayı saklama; kullanıcıya anlaşılır biçimde söyle.
- Araç sonuçlarını kısa ve doğal biçimde özetle. Aynı işi gereksiz yere iki kez yapma.
- Eon içindeki çalışma alanlarını, notları, alarmları, tarayıcıyı, medya kontrollerini, LocalSend'i, dosya vault'unu, uzak masaüstünü, bildirimleri ve sistem ayarlarını kullanabilirsin.`

export class OmniAgent implements AgentToolRuntime {
  readonly tools = OMNI_AGENT_TOOLS
  readonly systemPrompt = SYSTEM_PROMPT
  private readonly options: OmniAgentOptions

  constructor(options: OmniAgentOptions) {
    this.options = options
  }

  async execute(name: string, args: Record<string, unknown>) {
    const id = randomUUID()
    const label = toolLabel(name, args)
    this.emit({ id, tool: name, label, status: 'running', detail: 'İşlem çalışıyor', createdAt: Date.now() })
    try {
      const result = await this.run(name, args)
      this.emit({ id, tool: name, label, status: 'success', detail: resultSummary(result), createdAt: Date.now() })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ id, tool: name, label, status: 'error', detail: message, createdAt: Date.now() })
      throw error
    }
  }

  private async run(name: string, args: Record<string, unknown>) {
    switch (name) {
      case 'app_theme': {
        const theme = readEnum(args, 'theme', ['light', 'obsidian', 'rose', 'violet', 'ocean'] as const)
        this.options.setTheme(theme)
        return { ok: true, theme }
      }
      case 'app_workspace': {
        const workspace = readEnum(args, 'workspace', ['home', 'browser', 'ai', 'calendar', 'power', 'alarms', 'notes', 'localsend', 'remote', 'settings'] as const)
        this.options.openWorkspace(workspace)
        return { ok: true, workspace }
      }
      case 'browser': return this.browser(args)
      case 'notes': return this.notes(args)
      case 'alarms': return this.alarms(args)
      case 'power': return this.power(args)
      case 'media': return this.media(args)
      case 'localsend': return this.localSend(args)
      case 'vault': return this.vault(args)
      case 'transfers': return this.transfers(args)
      case 'system': return this.system(args)
      case 'remote': return this.remote(args)
      case 'notifications': return this.notifications(args)
      case 'programs': return this.programs(args)
      default: throw new Error(`Bilinmeyen Eon aracı: ${name}`)
    }
  }

  private async browser(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['open', 'navigate', 'list_tabs', 'reload', 'back', 'forward'] as const)
    if (action === 'open') {
      const query = readString(args, 'query')
      this.options.openBrowser(query)
      return { ok: true, query }
    }
    const snapshot = this.options.browser.getSession()
    if (action === 'list_tabs') return snapshot
    const activeId = snapshot.activeTabId
    if (!activeId) throw new Error('Aktif tarayıcı sekmesi yok. Önce browser open ile bir sayfa aç.')
    if (action === 'navigate') this.options.browser.navigate(activeId, normalizeNavigation(readString(args, 'query')))
    else if (action === 'reload') this.options.browser.reload(activeId)
    else if (action === 'back') this.options.browser.back(activeId)
    else this.options.browser.forward(activeId)
    return { ok: true, action, tabId: activeId }
  }

  private notes(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['list', 'create', 'update', 'delete', 'toggle_pin'] as const)
    if (action === 'list') return this.options.content.listNotes().slice(0, 80).map((note) => ({ ...note, content: clip(note.content, 1200) }))
    if (action === 'create') return this.options.content.saveNote(readString(args, 'content'), undefined, readOptionalBoolean(args, 'pinned'))
    const id = readString(args, 'id')
    if (action === 'update') return this.options.content.saveNote(readString(args, 'content'), id, readOptionalBoolean(args, 'pinned'))
    if (action === 'delete') return { deleted: this.options.content.deleteNote(id), id }
    return { pinned: this.options.content.toggleNotePin(id), id }
  }

  private alarms(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['list', 'create', 'cancel'] as const)
    if (action === 'list') return this.options.alarms.list()
    if (action === 'cancel') {
      const id = readString(args, 'id')
      return { cancelled: this.options.alarms.cancel(id), id }
    }
    const delaySeconds = readPositiveInt(args, 'delaySeconds', 315_360_000)
    return this.options.alarms.create({
      timestamp: Date.now() + delaySeconds * 1000,
      note: readOptionalString(args, 'note') || 'Eon ajan alarmı',
      intervalSeconds: null,
      occurrenceCount: 1,
      soundEnabled: readOptionalBoolean(args, 'soundEnabled') ?? true,
      soundProfile: readOptionalEnum(args, 'soundProfile', ['gentle', 'chime', 'urgent'] as const) ?? 'chime',
    })
  }

  private async power(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['status', 'schedule', 'cancel'] as const)
    if (action === 'status') return this.options.system.getTimerStatus()
    if (action === 'cancel') {
      await this.options.system.cancelShutdown()
      return { cancelled: true }
    }
    const powerAction = readEnum(args, 'powerAction', ['shutdown', 'restart'] as const)
    return this.options.system.scheduleShutdown(powerAction, readPositiveInt(args, 'delaySeconds', 315_360_000))
  }

  private async media(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['status', 'play_pause', 'next', 'previous', 'youtube_play_pause', 'youtube_next', 'youtube_previous', 'youtube_mute', 'youtube_volume'] as const)
    if (action === 'status') return this.options.browser.currentMedia()
    if (action === 'play_pause') return { ok: await this.options.browser.controlCurrentMedia('toggle-play-pause') }
    if (action === 'next') return { ok: await this.options.browser.controlCurrentMedia('next') }
    if (action === 'previous') return { ok: await this.options.browser.controlCurrentMedia('previous') }
    if (action === 'youtube_volume') {
      await this.options.browser.youtubeSetVolume(readNumberRange(args, 'volume', 0, 1))
      return { ok: true }
    }
    const youtubeAction = action === 'youtube_play_pause' ? 'toggle-play' : action === 'youtube_next' ? 'next' : action === 'youtube_previous' ? 'previous' : 'toggle-mute'
    await this.options.browser.youtubeControl(youtubeAction)
    return { ok: true, action }
  }

  private async localSend(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['status', 'devices', 'scan', 'send_text', 'set_auto_accept', 'open_downloads'] as const)
    if (action === 'status') return this.options.localSend.getStatus()
    if (action === 'devices') return this.options.localSend.getDevices()
    if (action === 'scan') {
      await this.options.localSend.scanNetwork()
      return { ok: true, devices: this.options.localSend.getDevices() }
    }
    if (action === 'set_auto_accept') return { enabled: this.options.localSend.setAutoAccept(readBoolean(args, 'enabled')) }
    if (action === 'open_downloads') {
      await this.options.localSend.openDownloadFolder()
      return { ok: true }
    }
    const targetIp = readString(args, 'targetIp')
    const targetPort = readPositiveInt(args, 'targetPort', 65_535)
    return { id: await this.options.localSend.sendText(targetIp, targetPort, readString(args, 'text')) }
  }

  private vault(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['default_path', 'list', 'read', 'write', 'create_file', 'create_folder', 'rename', 'delete', 'reveal'] as const)
    const defaultPath = this.options.content.getDefaultVaultPath()
    if (action === 'default_path') return { vaultPath: defaultPath }
    const vaultPath = readOptionalString(args, 'vaultPath') || defaultPath
    if (action === 'list') return this.options.content.listVaultEntries(vaultPath).slice(0, 300)
    const relPath = readString(args, 'path')
    if (action === 'read') return { path: relPath, content: this.options.content.readVaultFile(vaultPath, relPath) }
    if (action === 'write') {
      this.options.content.writeVaultFile(vaultPath, relPath, readStringAllowEmpty(args, 'content'))
      return { ok: true, path: relPath }
    }
    if (action === 'create_file') {
      this.options.content.createVaultFile(vaultPath, relPath, readOptionalString(args, 'content'))
      return { ok: true, path: relPath }
    }
    if (action === 'create_folder') {
      this.options.content.createVaultFolder(vaultPath, relPath)
      return { ok: true, path: relPath }
    }
    if (action === 'rename') {
      const newPath = readString(args, 'newPath')
      this.options.content.renameVaultEntry(vaultPath, relPath, newPath)
      return { ok: true, path: relPath, newPath }
    }
    if (action === 'delete') {
      this.options.content.deleteVaultEntry(vaultPath, relPath)
      return { ok: true, deleted: relPath }
    }
    this.options.content.revealVaultEntry(vaultPath, relPath)
    return { ok: true, path: relPath }
  }

  private async transfers(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['list', 'open', 'show', 'delete'] as const)
    if (action === 'list') return this.options.content.listTransfers().slice(0, 100)
    if (action === 'delete') {
      const id = readString(args, 'id')
      return { deleted: this.options.content.deleteTransfer(id), id }
    }
    const filePath = readString(args, 'path')
    if (action === 'open') await this.options.content.openTransfer(filePath)
    else this.options.content.showTransfer(filePath)
    return { ok: true, path: filePath }
  }

  private async system(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['info', 'autostart_status', 'autostart_set', 'minimize', 'toggle_maximize', 'show'] as const)
    if (action === 'info') return this.options.system.getInfo()
    if (action === 'autostart_status') return { enabled: this.options.system.getAutostart() }
    if (action === 'autostart_set') return { enabled: this.options.system.setAutostart(readBoolean(args, 'enabled')) }
    if (action === 'minimize') this.options.windows.minimize()
    else if (action === 'toggle_maximize') this.options.windows.toggleMaximize()
    else this.options.windows.showMain()
    return { ok: true, action }
  }

  private async remote(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['status', 'set_enabled', 'stop_session', 'trusted_devices'] as const)
    if (action === 'status') return this.options.remoteDesktop.getStatus()
    if (action === 'set_enabled') {
      const enabled = readBoolean(args, 'enabled')
      const settings = this.options.system.getSettings()
      if (settings) this.options.system.saveSettings({ ...settings, remoteDesktopEnabled: enabled, lastSavedAt: Date.now() })
      this.options.remoteDesktop.setEnabled(enabled)
      return { enabled }
    }
    if (action === 'trusted_devices') return this.options.localSend.listTrustedDevices()
    return { stopped: await this.options.remoteDesktop.stopSession() }
  }

  private notifications(args: Record<string, unknown>) {
    const notifications = this.options.getNotifications()
    if (!notifications) throw new Error('Bildirim servisi hazır değil.')
    const action = readEnum(args, 'action', ['status', 'history', 'test'] as const)
    if (action === 'status') return notifications.getStatus()
    if (action === 'history') return notifications.getHistory().slice(0, 100)
    return notifications.sendTestNotification(readOptionalString(args, 'title') || 'Eon', readOptionalString(args, 'body') || 'Eon ajanından test bildirimi')
  }

  private async programs(args: Record<string, unknown>) {
    const action = readEnum(args, 'action', ['list', 'launch'] as const)
    if (action === 'list') return (await this.options.windows.listPrograms(readOptionalBoolean(args, 'refresh') === true)).slice(0, 80)
    const programPath = readString(args, 'path')
    await this.options.windows.launchProgram(programPath)
    return { ok: true, path: programPath }
  }

  private emit(activity: AgentToolActivity) {
    try { this.options.onActivity?.(activity) } catch { /* UI telemetry must never break a tool */ }
  }
}

function readString(value: Record<string, unknown>, key: string) {
  const result = value[key]
  if (typeof result !== 'string' || !result.trim()) throw new Error(`Eksik veya geçersiz alan: ${key}`)
  return result.trim()
}

function readStringAllowEmpty(value: Record<string, unknown>, key: string) {
  const result = value[key]
  if (typeof result !== 'string') throw new Error(`Eksik veya geçersiz alan: ${key}`)
  return result
}

function readOptionalString(value: Record<string, unknown>, key: string) {
  const result = value[key]
  return typeof result === 'string' ? result.trim() : ''
}

function readBoolean(value: Record<string, unknown>, key: string) {
  const result = value[key]
  if (typeof result !== 'boolean') throw new Error(`Eksik veya geçersiz alan: ${key}`)
  return result
}

function readOptionalBoolean(value: Record<string, unknown>, key: string) {
  const result = value[key]
  return typeof result === 'boolean' ? result : undefined
}

function readPositiveInt(value: Record<string, unknown>, key: string, max: number) {
  const result = value[key]
  if (typeof result !== 'number' || !Number.isInteger(result) || result < 1 || result > max) throw new Error(`Eksik veya geçersiz alan: ${key}`)
  return result
}

function readNumberRange(value: Record<string, unknown>, key: string, min: number, max: number) {
  const result = value[key]
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) throw new Error(`Eksik veya geçersiz alan: ${key}`)
  return result
}

function readEnum<const T extends readonly string[]>(value: Record<string, unknown>, key: string, values: T): T[number] {
  const result = readString(value, key)
  if (!values.includes(result)) throw new Error(`Geçersiz ${key}: ${result}`)
  return result as T[number]
}

function readOptionalEnum<const T extends readonly string[]>(value: Record<string, unknown>, key: string, values: T): T[number] | undefined {
  const result = readOptionalString(value, key)
  if (!result) return undefined
  if (!values.includes(result)) throw new Error(`Geçersiz ${key}: ${result}`)
  return result as T[number]
}

function normalizeNavigation(value: string) {
  const trimmed = value.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

function toolLabel(name: string, args: Record<string, unknown>) {
  const action = typeof args.action === 'string' ? ` · ${args.action.replaceAll('_', ' ')}` : ''
  const labels: Record<string, string> = {
    app_theme: 'Tema', app_workspace: 'Çalışma alanı', browser: 'Tarayıcı', notes: 'Notlar', alarms: 'Alarmlar',
    power: 'Güç', media: 'Medya', localsend: 'LocalSend', vault: 'Vault', transfers: 'Aktarımlar', system: 'Sistem',
    remote: 'Uzak masaüstü', notifications: 'Bildirimler', programs: 'Programlar',
  }
  return `${labels[name] || name}${action}`
}

function resultSummary(result: unknown) {
  if (result == null) return 'Tamamlandı'
  if (Array.isArray(result)) return `${result.length} öğe`
  if (typeof result === 'object') {
    const value = result as Record<string, unknown>
    if (value.ok === true) return 'Tamamlandı'
    if (value.deleted === true) return 'Silindi'
    if (value.cancelled === true) return 'İptal edildi'
    if (typeof value.theme === 'string') return `${value.theme} uygulandı`
  }
  return clip(typeof result === 'string' ? result : JSON.stringify(result), 120)
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
