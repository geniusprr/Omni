import { app, Notification, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import https from 'node:https'
import dgram from 'node:dgram'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { ConnectionInfo, LocalSendDevice, LocalSendStatus, MirroredNotification, ReceivedFileRecord } from '../src/types.js'
import type { AlarmManager } from './AlarmManager.js'
import type { ContentManager } from './ContentManager.js'
import type { SystemManager } from './SystemManager.js'
import { TrustedDeviceStore } from './TrustedDeviceStore.js'

interface UploadFile { id: string; fileName: string; size: number; fileType?: string }
interface UploadSession { sender: LocalSendDevice; files: Record<string, UploadFile>; tokens: Record<string, string>; createdAt: number }
interface MobileHooks { system: SystemManager; alarms: AlarmManager; content: ContentManager; emit: (event: string, payload: unknown) => void }
interface PairingAttempt { failures: number; windowStartedAt: number; lockedUntil: number }
interface RemoteDesktopHandlers {
  handleRequest: (request: http.IncomingMessage, response: http.ServerResponse, url: URL) => Promise<boolean>
  handleUpgrade: (request: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => void
}

const CLOUD_TRANSFER_BUCKET = 'kapanis-transfers'
const MAX_CLOUD_TRANSFER_BYTES = 512 * 1024 * 1024

export class LocalSendManager {
  readonly port = 53317
  private readonly dataDir: string
  private readonly downloadDir: string
  private readonly devicesPath: string
  private readonly filesPath: string
  private readonly emitDevice: (device: LocalSendDevice) => void
  private readonly emitFile: (file: ReceivedFileRecord) => void
  private readonly mobile: MobileHooks
  private readonly devices = new Map<string, LocalSendDevice>()
  private readonly trustedDevices: TrustedDeviceStore
  private receivedFiles: ReceivedFileRecord[] = []
  private sessions = new Map<string, UploadSession>()
  private server: http.Server | null = null
  private udpServer: dgram.Socket | null = null
  private autoAccept = true
  private activeSseClients = new Set<http.ServerResponse>()
  private recentNotifications: MirroredNotification[] = []
  private readonly pairingAttempts = new Map<string, PairingAttempt>()
  private terminalRunning = false
  private discoveryTimer: NodeJS.Timeout | null = null
  private discoveryInFlight = false
  private remoteDesktopHandlers: RemoteDesktopHandlers | null = null

  constructor(dataDir: string, emitDevice: (device: LocalSendDevice) => void, emitFile: (file: ReceivedFileRecord) => void, mobile: MobileHooks) {
    this.dataDir = dataDir
    this.downloadDir = path.join(app.getPath('downloads'), 'kapanis_received')
    this.devicesPath = path.join(dataDir, 'localsend-devices.json')
    this.filesPath = path.join(dataDir, 'localsend-files.json')
    this.emitDevice = emitDevice
    this.emitFile = emitFile
    this.mobile = mobile
    fs.mkdirSync(this.downloadDir, { recursive: true })
    for (const device of readArray<LocalSendDevice>(this.devicesPath)) {
      if (device && typeof device.ip === 'string' && typeof device.port === 'number') this.devices.set(device.ip + ':' + device.port, device)
    }
    this.trustedDevices = new TrustedDeviceStore(dataDir)
    this.receivedFiles = readArray<ReceivedFileRecord>(this.filesPath).slice(0, 200)
  }

  setRemoteDesktopHandlers(handlers: RemoteDesktopHandlers | null) {
    this.remoteDesktopHandlers = handlers
  }

  listTrustedDevices() {
    return this.trustedDevices.list()
  }

  revokeTrustedDevice(id: string) {
    return this.trustedDevices.revoke(id)
  }

  revokeAllTrustedDevices() {
    return this.trustedDevices.revokeAll()
  }

  private getAuthorizationToken(request: http.IncomingMessage, url?: URL) {
    const authHeader = request.headers['authorization'] || request.headers['x-auth-token']
    let token = ''
    if (typeof authHeader === 'string') {
      token = authHeader.replace(/^Bearer\s+/i, '').trim()
    }
    if (!token) {
      token = url?.searchParams.get('token') || url?.searchParams.get('auth') || ''
    }
    return token
  }

  authorizeRequest(request: http.IncomingMessage, url?: URL) {
    return this.trustedDevices.authorize(this.getAuthorizationToken(request, url))
  }

  private isAuthorized(request: http.IncomingMessage, url: URL): boolean {
    return Boolean(this.authorizeRequest(request, url))
  }

  private getPairingRetryAfterSeconds(senderIp: string) {
    const attempt = this.pairingAttempts.get(senderIp)
    if (!attempt) return 0
    const now = Date.now()
    if (attempt.lockedUntil > now) return Math.ceil((attempt.lockedUntil - now) / 1_000)
    if (attempt.lockedUntil > 0 || now - attempt.windowStartedAt > 5 * 60_000) this.pairingAttempts.delete(senderIp)
    return 0
  }

  private recordPairingFailure(senderIp: string) {
    const now = Date.now()
    const previous = this.pairingAttempts.get(senderIp)
    const attempt = !previous || now - previous.windowStartedAt > 5 * 60_000
      ? { failures: 0, windowStartedAt: now, lockedUntil: 0 }
      : previous
    attempt.failures += 1
    if (attempt.failures >= 5) attempt.lockedUntil = now + 60_000
    this.pairingAttempts.set(senderIp, attempt)
  }

  broadcastNotification(notification: MirroredNotification) {
    this.recentNotifications = [notification, ...this.recentNotifications].slice(0, 50)
    const payload = `data: ${JSON.stringify(notification)}\n\n`
    for (const client of this.activeSseClients) {
      try {
        client.write(payload)
      } catch {
        this.activeSseClients.delete(client)
      }
    }
  }

  start() {
    if (this.server) return
    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        console.error('[localsend] request failed', error)
        if (!response.headersSent) { response.statusCode = 500; sendJson(response, { error: 'İstek işlenemedi.' }) }
        else response.end()
      })
    })
    this.server = server
    server.on('upgrade', (request, socket, head) => {
      if (!this.remoteDesktopHandlers) {
        socket.destroy()
        return
      }
      try {
        this.remoteDesktopHandlers.handleUpgrade(request, socket, head)
      } catch {
        socket.destroy()
      }
    })
    server.on('error', (error) => {
      if (this.server === server) this.server = null
      const code = (error as NodeJS.ErrnoException).code
      console.error(`[localsend] server failed${code ? ` (${code})` : ''}`, error)
    })
    server.listen(this.port, '0.0.0.0', () => console.info('[localsend] listening on ' + this.port))

    // Keep local phone presence fresh without requiring the Share screen to be
    // open. The Android foreground service answers these probes immediately.
    void this.scanNetwork()
    this.discoveryTimer = setInterval(() => {
      void this.scanNetwork()
    }, 4_000)

    // Start UDP discovery responder
    try {
      const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      udp.on('message', (msg, rinfo) => {
        try {
          const text = msg.toString('utf8')
          const data = JSON.parse(text)
          if (data && (data.type === 'kapanis-discovery-probe' || data.type === 'kapanis-localsend-discovery')) {
            const settings = this.mobile.system.getSettings()
            const device = this.deviceInfo()
            const response = Buffer.from(
              JSON.stringify({
                type: 'kapanis-discovery-response',
                deviceId: settings?.deviceId,
                deviceName: settings?.deviceName || os.hostname() || 'Windows PC',
                port: this.port,
                ips: localIps(),
                version: '2.0.0',
                device,
              })
            )
            udp.send(response, rinfo.port, rinfo.address)
          }
        } catch {}
      })
      udp.on('error', () => {
        try { udp.close() } catch {}
      })
      udp.bind(this.port, '0.0.0.0', () => {
        try { udp.setBroadcast(true) } catch {}
      })
      this.udpServer = udp
    } catch {}
  }

  stop() {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer)
    this.discoveryTimer = null
    this.discoveryInFlight = false
    this.server?.close()
    this.server = null
    try { this.udpServer?.close() } catch {}
    this.udpServer = null
  }

  getStatus(): LocalSendStatus {
    const ips = localIps()
    const device = this.deviceInfo()
    return {
      isRunning: Boolean(this.server),
      localIp: ips[0] || '127.0.0.1',
      allIps: ips,
      port: this.port,
      alias: device.alias,
      fingerprint: device.fingerprint,
      autoAccept: this.autoAccept,
      downloadDir: this.downloadDir,
      discoveredCount: this.devices.size,
    }
  }

  async handleRemoteDesktopRequest(request: http.IncomingMessage, response: http.ServerResponse, url: URL) {
    return this.remoteDesktopHandlers?.handleRequest(request, response, url) ?? false
  }

  getDevices() {
    const cutoff = Date.now() - 5 * 60_000
    return [...this.devices.values()].filter((device) => device.lastSeen > cutoff).sort((a, b) => b.lastSeen - a.lastSeen)
  }

  async scanNetwork() {
    if (this.discoveryInFlight) return
    this.discoveryInFlight = true
    try {
      const socket = dgram.createSocket('udp4')
      const message = Buffer.from(JSON.stringify({ type: 'kapanis-localsend-discovery', device: this.deviceInfo() }))
      await new Promise<void>((resolve) => {
        let finished = false
        let timeout: NodeJS.Timeout | null = null
        const finish = () => {
          if (finished) return
          finished = true
          if (timeout) clearTimeout(timeout)
          try { socket.close() } catch {}
          resolve()
        }
        socket.once('error', finish)
        socket.on('message', (payload, rinfo) => {
          try {
            const response = JSON.parse(payload.toString('utf8')) as { type?: string; device?: unknown; port?: unknown }
            if (response.type !== 'kapanis-discovery-response' && response.type !== 'kapanis-localsend-discovery-response') return
            const info = response.device || response
            const item = info && typeof info === 'object' ? info as { port?: unknown; fingerprint?: unknown } : {}
            if (item.fingerprint === this.deviceInfo().fingerprint) return
            const candidatePort = typeof item.port === 'number' ? item.port : typeof response.port === 'number' ? response.port : this.port
            const port = Number.isInteger(candidatePort) && candidatePort > 0 && candidatePort <= 65_535 ? candidatePort : this.port
            this.saveDevice(this.normalizeDevice(info, rinfo.address.replace(/^::ffff:/, ''), port, 'http'))
          } catch {}
        })
        socket.bind(0, '0.0.0.0', () => {
          try {
            socket.setBroadcast(true)
            const destinations = new Set(['255.255.255.255', ...localIps().map((ip) => {
              const parts = ip.split('.')
              return parts.length === 4 ? parts.slice(0, 3).concat('255').join('.') : ip
            })])
            for (const destination of destinations) socket.send(message, this.port, destination)
            timeout = setTimeout(finish, 1_500)
          } catch {
            finish()
          }
        })
      })
    } finally {
      this.discoveryInFlight = false
    }
  }

  async addManualDevice(rawIp: string, targetPort = this.port) {
    const raw = rawIp.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    const [ip, portText] = raw.split(':')
    const port = Number(portText) || targetPort
    for (const protocol of ['http', 'https']) {
      try {
        const info = await requestJson(protocol + '://' + ip + ':' + port + '/api/localsend/v2/info', 'GET')
        const device = this.normalizeDevice(info, ip, port, protocol)
        this.saveDevice(device)
        return device
      } catch { /* try next protocol */ }
    }
    throw new Error('Cihaza ulaşılamadı (' + ip + ':' + port + ').')
  }

  getReceivedFiles() { return this.receivedFiles.map((file) => ({ ...file })) }
  setAutoAccept(enabled: boolean) { this.autoAccept = enabled; return enabled }
  async openDownloadFolder() {
    const error = await shell.openPath(this.downloadDir)
    if (error) throw new Error(error)
  }

  async sendText(targetIp: string, targetPort: number, text: string) {
    if (!text.trim()) throw new Error('Gönderilecek metin boş olamaz.')
    return this.sendFileBytes(targetIp, targetPort, 'message.txt', Buffer.from(text, 'utf8'), 'text/plain')
  }

  async sendFile(targetIp: string, targetPort: number, filePath: string) {
    if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) throw new Error('Dosya bulunamadı.')
    return this.sendFileBytes(targetIp, targetPort, path.basename(filePath), fs.readFileSync(filePath), 'application/octet-stream')
  }

  /** Queue a PC -> phone file in Supabase for delivery by the phone service. */
  async sendCloudFile(filePath: string, controllerId: string) {
    if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) throw new Error('Dosya bulunamadı.')
    if (!controllerId.trim()) throw new Error('Bulut hedef cihazı seçilmedi.')

    const settings = this.mobile.system.getSettings()
    if (!settings?.supabaseUrl || !settings.supabaseAnonKey || !settings.deviceId) {
      throw new Error('Bulut dosya aktarımı için Supabase bağlantısını önce tamamlayın.')
    }

    const stat = fs.statSync(filePath)
    if (!stat.isFile()) throw new Error('Seçilen yol bir dosya değil.')
    if (stat.size > MAX_CLOUD_TRANSFER_BYTES) throw new Error('Bulut dosyaları en fazla 512 MB olabilir.')

    const transferId = randomUUID()
    const fileName = sanitizeFilename(path.basename(filePath))
    const storagePath = `${settings.deviceId}/${transferId}/${fileName}`
    const mimeType = mimeTypeForFilename(fileName)
    const bytes = fs.readFileSync(filePath)
    const supabase = createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const upload = await supabase.storage
      .from(CLOUD_TRANSFER_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false })
    if (upload.error) {
      throw new Error(`Bulut depolama hatası: ${upload.error.message}`)
    }

    const insert = await supabase.from('device_transfers').insert({
      id: transferId,
      device_id: settings.deviceId,
      controller_id: controllerId.trim(),
      file_name: fileName,
      mime_type: mimeType,
      size: stat.size,
      storage_path: storagePath,
      status: 'pending',
    })
    if (insert.error) {
      await supabase.storage.from(CLOUD_TRANSFER_BUCKET).remove([storagePath]).catch(() => undefined)
      throw new Error(`Bulut aktarım kuyruğu oluşturulamadı: ${insert.error.message}`)
    }

    return `'${fileName}' buluta yüklendi. Telefon çevrim dışıysa bağlandığında otomatik indirilecek.`
  }

  getConnectionInfo(): ConnectionInfo {
    const ips = localIps()
    const host = ips[0] || '127.0.0.1'
    return {
      port: this.port,
      ipAddresses: ips,
      deviceName: os.hostname() || 'Eon Desktop',
      qrPayload: 'kapanis://connect?host=' + encodeURIComponent(host) + '&port=' + this.port + '&name=' + encodeURIComponent(os.hostname() || 'Desktop'),
    }
  }

  private async sendFileBytes(targetIp: string, targetPort: number, fileName: string, bytes: Buffer, fileType: string) {
    const info = await this.addManualDevice(targetIp, targetPort).catch(() => null)
    const protocol = info?.protocol === 'http' ? 'http' : 'https'
    const fileId = randomUUID()
    const prepare = await requestJson(protocol + '://' + targetIp + ':' + targetPort + '/api/localsend/v2/prepare-upload', 'POST', {
      info: this.deviceInfo(),
      files: { [fileId]: { id: fileId, fileName, size: bytes.length, fileType } },
    })
    const token = prepare?.files?.[fileId]
    if (typeof prepare?.sessionId !== 'string' || typeof token !== 'string') throw new Error('Dosya oturumu doğrulanamadı.')
    await requestBytes(protocol + '://' + targetIp + ':' + targetPort + '/api/localsend/v2/upload?sessionId=' + encodeURIComponent(prepare.sessionId) + '&fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token), bytes)
    return "'" + fileName + "' başarıyla gönderildi!"
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
    const url = new URL(request.url || '/', 'http://' + (request.headers.host || 'localhost'))
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
    const senderIp = request.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown'

    if (this.remoteDesktopHandlers && url.pathname.startsWith('/api/remote/')) {
      if (await this.remoteDesktopHandlers.handleRequest(request, response, url)) return
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const settings = this.mobile.system.getSettings()
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(renderCompanionHtml(settings?.deviceName || os.hostname() || 'Eon Desktop', this.port))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/pair') {
      if (!isPrivateLanAddress(senderIp)) {
        response.statusCode = 403
        sendJson(response, { success: false, error: 'Eşleştirme yalnızca aynı özel yerel ağdan yapılabilir.' })
        return
      }
      const retryAfterSeconds = this.getPairingRetryAfterSeconds(senderIp)
      if (retryAfterSeconds > 0) {
        response.statusCode = 429
        sendJson(response, { success: false, error: `Çok fazla hatalı eşleştirme denemesi. ${retryAfterSeconds} saniye sonra tekrar deneyin.` })
        return
      }
      const body = await readJson(request)
      const inputCode = String(body?.pairingCode || body?.code || '').trim().toUpperCase()
      const settings = this.mobile.system.getSettings()
      const validCode = settings?.pairingCode?.trim().toUpperCase() || ''
      const validSecret = settings?.pairingSecret?.trim().toUpperCase() || ''
      if (inputCode && (inputCode === validCode || inputCode === validSecret)) {
        this.pairingAttempts.delete(senderIp)
        const trusted = this.trustedDevices.issueToken(
          typeof body?.controllerId === 'string' ? body.controllerId : '',
          typeof body?.controllerName === 'string' ? body.controllerName : 'Mobil cihaz',
        )
        const clientDevice = this.normalizeDevice(body, senderIp, Number(body?.port) || this.port, 'http')
        this.saveDevice(clientDevice)
        sendJson(response, {
          success: true,
          authToken: trusted.token,
          deviceName: settings?.deviceName || os.hostname() || 'Windows PC',
          deviceId: settings?.deviceId,
          pairingCode: validCode,
          timerState: this.mobile.system.getTimerStatus(),
          trustedDevice: trusted.device,
        })
        return
      }
      this.recordPairingFailure(senderIp)
      response.statusCode = 401
      sendJson(response, { success: false, error: 'Hatalı eşleştirme kodu! Lütfen bilgisayar ekranındaki kodu kontrol edin.' })
      return
    }

    if (request.method === 'GET' && (url.pathname === '/api/status' || url.pathname === '/api/local/state')) {
      const isAuth = this.isAuthorized(request, url)
      const settings = this.mobile.system.getSettings()
      sendJson(response, {
        status: 'ok',
        authenticated: isAuth,
        deviceName: settings?.deviceName || os.hostname() || 'Eon Desktop',
        deviceId: settings?.deviceId,
        // Pairing credentials must never be part of an unauthenticated discovery response.
        pairingCode: isAuth ? settings?.pairingCode : undefined,
        version: '2.0.0',
        port: this.port,
        timerState: isAuth ? this.mobile.system.getTimerStatus() : null,
        alarms: isAuth ? this.mobile.alarms.list() : [],
      })
      return
    }

    // Protected routes check
    const protectedPaths = [
      '/api/command',
      '/api/upload',
      '/api/notifications',
      '/api/notifications/stream',
      '/api/notifications/test',
      '/api/alarms/create',
      '/api/alarms/cancel',
      '/api/notes/create',
      '/api/clipboard',
      '/api/notify',
      '/api/terminal/status',
      '/api/terminal/execute',
    ]
    if (protectedPaths.includes(url.pathname)) {
      if (!this.isAuthorized(request, url)) {
        response.statusCode = 401
        sendJson(response, { success: false, error: 'Bu işlem için PC eşleştirme kodu ile giriş yapmalısınız.', requiresAuth: true })
        return
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/notifications/stream') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      response.write('event: ready\ndata: {"status":"connected"}\n\n')
      for (const notif of this.recentNotifications.slice(0, 20).reverse()) {
        response.write(`data: ${JSON.stringify(notif)}\n\n`)
      }
      this.activeSseClients.add(response)
      const keepAlive = setInterval(() => {
        try { response.write(': ping\n\n') } catch { clearInterval(keepAlive); this.activeSseClients.delete(response) }
      }, 20_000)
      request.on('close', () => {
        clearInterval(keepAlive)
        this.activeSseClients.delete(response)
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/notifications') {
      sendJson(response, this.recentNotifications)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/notifications/test') {
      const testNotif: MirroredNotification = {
        id: randomUUID(),
        appName: 'Eon Test',
        title: 'Test Bildirimi',
        body: 'Yerel ağdan telefonunuza başarıyla iletildi!',
        timestamp: Date.now(),
        source: 'test',
      }
      this.broadcastNotification(testNotif)
      sendJson(response, { success: true, notification: testNotif })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/register') {
      const body = await readJson(request)
      const device = this.normalizeDevice(body, senderIp, Number(body?.port) || this.port, 'http')
      this.saveDevice(device)
      const settings = this.mobile.system.getSettings()
      sendJson(response, {
        status: 'ok',
        deviceName: settings?.deviceName || os.hostname() || 'Eon Desktop',
        deviceId: settings?.deviceId,
        version: '2.0.0',
        port: this.port,
        timerState: this.mobile.system.getTimerStatus(),
        alarms: this.mobile.alarms.list(),
        device: this.deviceInfo(),
      })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/command') {
      const body = await readJson(request)
      let success = false
      const command = typeof body?.command === 'string' ? body.command : ''
      const delaySeconds = typeof body?.delaySeconds === 'number' ? body.delaySeconds : typeof body?.delay_seconds === 'number' ? body.delay_seconds : 0
      try {
        if (command === 'cancel') { await this.mobile.system.cancelShutdown(); success = true }
        else if (command === 'shutdown' || command === 'restart') { await this.mobile.system.scheduleShutdown(command, Math.max(1, delaySeconds)); success = true }
      } catch { success = false }
      if (success) this.mobile.emit('remote:command', { command, delaySeconds })
      sendJson(response, { success, timerState: this.mobile.system.getTimerStatus() })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/terminal/status') {
      const isElevated = await this.mobile.system.isRunningAsAdministrator()
      sendJson(response, {
        success: true,
        available: true,
        isElevated,
        requiresElevation: !isElevated,
        timeoutSeconds: 30,
        maxCommandLength: 4_096,
      })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/terminal/execute') {
      if (!isPrivateLanAddress(senderIp)) {
        response.statusCode = 403
        sendJson(response, { success: false, error: 'Yönetici CMD yalnızca aynı özel yerel ağdan kullanılabilir.' })
        return
      }
      if (this.terminalRunning) {
        response.statusCode = 409
        sendJson(response, { success: false, error: 'Başka bir CMD komutu hâlâ çalışıyor. Tamamlanmasını bekleyin.' })
        return
      }

      const body = await readJson(request)
      const command = typeof body?.command === 'string' ? body.command : ''
      this.terminalRunning = true
      try {
        const result = await this.mobile.system.executeElevatedCmd(command)
        console.info(`[local-terminal] completed from ${senderIp}; exit=${result.exitCode ?? 'n/a'}; timeout=${result.timedOut}`)
        sendJson(response, { success: true, ...result })
      } catch (error) {
        const typed = error as Error & { code?: string }
        const requiresElevation = typed.code === 'ELEVATION_REQUIRED'
        response.statusCode = requiresElevation ? 403 : 400
        sendJson(response, { success: false, error: typed.message || 'CMD komutu çalıştırılamadı.', requiresElevation })
      } finally {
        this.terminalRunning = false
      }
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/alarms') {
      sendJson(response, this.mobile.alarms.list())
      return
    }
    if (request.method === 'POST' && (url.pathname === '/api/alarms/create' || url.pathname === '/api/alarm')) {
      const body = await readJson(request)
      try {
        const alarm = this.mobile.alarms.create({ timestamp: Number(body?.timestamp), note: typeof body?.note === 'string' ? body.note : '', intervalSeconds: typeof body?.intervalSeconds === 'number' ? body.intervalSeconds : null, occurrenceCount: typeof body?.occurrenceCount === 'number' ? body.occurrenceCount : null, soundEnabled: body?.soundEnabled !== false, soundProfile: body?.soundProfile === 'gentle' || body?.soundProfile === 'urgent' ? body.soundProfile : 'chime' })
        sendJson(response, { success: true, alarm })
      } catch { sendJson(response, { success: false, alarm: null }) }
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/alarms/cancel') {
      const body = await readJson(request)
      sendJson(response, { success: typeof body?.id === 'string' ? this.mobile.alarms.cancel(body.id) : false })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/notify') {
      const body = await readJson(request)
      const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Eon Mobil Bildirim'
      const message = typeof body?.message === 'string' ? body.message.slice(0, 2_000) : ''
      if (message && Notification.isSupported()) new Notification({ title, body: message }).show()
      this.mobile.emit('mobile:notification', { id: randomUUID(), title, message, urgent: body?.urgent === true, createdAt: Date.now() })
      sendJson(response, { success: true })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/clipboard') {
      const body = await readJson(request)
      const text = typeof body?.text === 'string' ? body.text : ''
      const record = this.addReceivedText(text, 'Mobil Pano', senderIp)
      if (record) sendJson(response, { success: true })
      else sendJson(response, { success: false })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/upload') {
      const rawFilename = Array.isArray(request.headers['x-filename']) ? request.headers['x-filename'][0] : request.headers['x-filename']
      const filename = sanitizeFilename(typeof rawFilename === 'string' && rawFilename ? decodeURIComponent(rawFilename) : `dosya_${Date.now()}.dat`)
      const bytes = await readBytes(request, 50 * 1024 * 1024)
      const target = uniquePath(path.join(this.downloadDir, filename))
      fs.writeFileSync(target, bytes)
      const record: ReceivedFileRecord = { id: randomUUID(), fileName: path.basename(target), size: bytes.length, senderAlias: 'Mobil Transfer', senderIp, localPath: target, isText: false, textPreview: null, receivedAt: Date.now() }
      this.receivedFiles = [record, ...this.receivedFiles].slice(0, 200)
      writeJson(this.filesPath, this.receivedFiles)
      this.emitFile(record)
      sendJson(response, { id: record.id, filename: record.fileName, path: record.localPath, size: record.size })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/received-files') {
      sendJson(response, this.receivedFiles)
      return
    }
    if (url.pathname.startsWith('/api/vault/')) {
      await this.handleMobileVault(url, request, response)
      return
    }
    if (url.pathname === '/api/localsend/v2/info' && request.method === 'GET') { sendJson(response, this.deviceInfo()); return }
    if (url.pathname === '/api/localsend/v2/register' && request.method === 'POST') {
      const body = await readJson(request)
      const device = this.normalizeDevice(body, request.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown', Number(body?.port) || this.port, 'http')
      this.saveDevice(device)
      sendJson(response, this.deviceInfo())
      return
    }
    if (url.pathname === '/api/localsend/v2/prepare-upload' && request.method === 'POST') {
      if (!this.autoAccept) { response.statusCode = 403; sendJson(response, { error: 'Otomatik kabul kapalı.' }); return }
      const body = await readJson(request)
      const sessionId = randomUUID()
      const files = (body?.files && typeof body.files === 'object' ? body.files : {}) as Record<string, UploadFile>
      const tokens: Record<string, string> = {}
      for (const id of Object.keys(files)) tokens[id] = randomUUID()
      const sender = this.normalizeDevice(body?.info, request.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown', this.port, 'http')
      this.sessions.set(sessionId, { sender, files, tokens, createdAt: Date.now() })
      sendJson(response, { sessionId, files: tokens })
      return
    }
    if (url.pathname === '/api/localsend/v2/upload' && request.method === 'POST') {
      await this.handleUpload(request, response, url.searchParams.get('sessionId') || '', url.searchParams.get('fileId') || '', url.searchParams.get('token') || '')
      return
    }
    response.statusCode = 404
    sendJson(response, { error: 'Bulunamadı' })
  }

  private async handleUpload(request: http.IncomingMessage, response: http.ServerResponse, sessionId: string, fileId: string, token: string) {
    const session = this.sessions.get(sessionId)
    const file = session?.files[fileId]
    if (!session || !file || session.tokens[fileId] !== token) { response.statusCode = 403; sendJson(response, { error: 'Oturum veya token geçersiz' }); return }
    const name = sanitizeFilename(file.fileName)
    const target = uniquePath(path.join(this.downloadDir, name))
    const output = fs.createWriteStream(target)
    let size = 0
    request.on('data', (chunk: Buffer) => { size += chunk.length })
    request.pipe(output)
    await new Promise<void>((resolve) => output.once('finish', resolve))
    const received: ReceivedFileRecord = {
      id: randomUUID(),
      fileName: path.basename(target),
      size,
      senderAlias: session.sender.alias,
      senderIp: session.sender.ip,
      localPath: target,
      isText: file.fileType === 'text/plain' || /\.txt$/i.test(name),
      textPreview: null,
      receivedAt: Date.now(),
    }
    this.receivedFiles = [received, ...this.receivedFiles].slice(0, 200)
    writeJson(this.filesPath, this.receivedFiles)
    this.emitFile(received)
    response.statusCode = 200
    sendJson(response, {})
  }

  private deviceInfo(): LocalSendDevice {
    const settings = this.mobile.system.getSettings()
    return {
      ip: localIps()[0] || '127.0.0.1',
      port: this.port,
      alias: settings?.deviceName || os.hostname() || 'Eon Desktop',
      version: '1.0',
      deviceModel: 'Electron',
      deviceType: 'desktop',
      fingerprint: settings?.deviceId || 'kapanis-electron',
      protocol: 'http',
      download: true,
      lastSeen: Date.now(),
    }
  }

  private normalizeDevice(value: unknown, ip: string, port: number, protocol: string): LocalSendDevice {
    const item = value && typeof value === 'object' ? value as Partial<LocalSendDevice> : {}
    return {
      ip,
      port,
      alias: typeof item.alias === 'string' ? item.alias : 'LocalSend cihazı',
      version: typeof item.version === 'string' ? item.version : '1.0',
      deviceModel: typeof item.deviceModel === 'string' ? item.deviceModel : null,
      deviceType: typeof item.deviceType === 'string' ? item.deviceType : 'desktop',
      fingerprint: typeof item.fingerprint === 'string' ? item.fingerprint : ip + ':' + port,
      protocol,
      download: item.download !== false,
      lastSeen: Date.now(),
    }
  }

  private saveDevice(device: LocalSendDevice) {
    this.devices.set(device.ip + ':' + device.port, device)
    writeJson(this.devicesPath, [...this.devices.values()])
    this.emitDevice(device)
  }

  private addReceivedText(text: string, senderAlias: string, senderIp: string) {
    if (!text) return null
    const record: ReceivedFileRecord = {
      id: randomUUID(),
      fileName: 'pano.txt',
      size: Buffer.byteLength(text, 'utf8'),
      senderAlias,
      senderIp,
      localPath: '',
      isText: true,
      textPreview: text.slice(0, 4_000),
      receivedAt: Date.now(),
    }
    this.receivedFiles = [record, ...this.receivedFiles].slice(0, 200)
    writeJson(this.filesPath, this.receivedFiles)
    this.emitFile(record)
    return record
  }

  private async handleMobileVault(url: URL, request: http.IncomingMessage, response: http.ServerResponse) {
    const vaultPath = this.mobile.content.getDefaultVaultPath()
    try {
      if (request.method === 'GET' && url.pathname === '/api/vault/list') {
        sendJson(response, this.mobile.content.listVaultEntries(vaultPath))
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/vault/read') {
        const relPath = url.searchParams.get('path') || ''
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
        response.end(this.mobile.content.readVaultFile(vaultPath, relPath))
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/vault/write') {
        const body = await readJson(request)
        this.mobile.content.writeVaultFile(vaultPath, String(body?.path || ''), typeof body?.content === 'string' ? body.content : '')
        sendJson(response, { success: true })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/vault/create') {
        const body = await readJson(request)
        this.mobile.content.createVaultFile(vaultPath, String(body?.path || ''), typeof body?.content === 'string' ? body.content : '')
        sendJson(response, { success: true })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/vault/delete') {
        const body = await readJson(request)
        this.mobile.content.deleteVaultEntry(vaultPath, String(body?.path || ''))
        sendJson(response, { success: true })
        return
      }
      response.statusCode = 404
      sendJson(response, { error: 'Vault endpoint bulunamadı.' })
    } catch (error) {
      response.statusCode = request.method === 'GET' ? 404 : 400
      sendJson(response, { success: false, error: error instanceof Error ? error.message : 'Vault işlemi başarısız.' })
    }
  }
}

function localIps() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, items]) => (items || [])
      .filter((item) => item.family === 'IPv4' && !item.internal)
      .map((item) => ({ address: item.address, name })))
    .sort((a, b) => localIpPriority(a.name, a.address) - localIpPriority(b.name, b.address))
    .map((item) => item.address)
}

function localIpPriority(interfaceName: string, address: string) {
  const [first = 0, second = 0] = address.split('.').map((part) => Number(part))
  const name = interfaceName.toLowerCase()
  const likelyVirtual = /virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier/.test(name)
  const likelyLan = /wi-?fi|wlan|wireless|ethernet|local area/.test(name)
  let priority = 50
  if (first === 192 && second === 168) priority = 0
  else if (first === 10) priority = 5
  else if (first === 172 && second >= 16 && second <= 31) priority = 10
  else if (first === 169 && second === 254) priority = 100
  if (likelyVirtual) priority += 30
  if (likelyLan) priority -= 5
  return priority
}

function isPrivateLanAddress(rawAddress: string) {
  const address = rawAddress.split('%')[0].toLowerCase()
  if (address === '::1') return true
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true

  const octets = address.split('.').map((value) => Number(value))
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [first, second] = octets
  return first === 10
    || first === 127
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168
}

function sanitizeFilename(value: string) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'file-' + Date.now() }
function mimeTypeForFilename(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  const known: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.zip': 'application/zip',
  }
  return known[extension] || 'application/octet-stream'
}
function uniquePath(value: string) {
  if (!fs.existsSync(value)) return value
  const ext = path.extname(value)
  const stem = path.basename(value, ext)
  const dir = path.dirname(value)
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = path.join(dir, stem + '_' + i + ext)
    if (!fs.existsSync(candidate)) return candidate
  }
  return path.join(dir, stem + '_' + Date.now() + ext)
}
function readArray<T>(filePath: string): T[] { try { const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown; return Array.isArray(value) ? value as T[] : [] } catch { return [] } }
function writeJson(filePath: string, value: unknown) { try { fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8') } catch { /* best effort */ } }
function sendJson(response: http.ServerResponse, value: unknown) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)) }
async function readJson(request: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 5 * 1024 * 1024) throw new Error('İstek çok büyük.') }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as any } catch { return {} }
}
async function readBytes(request: http.IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    total += bytes.length
    if (total > maxBytes) throw new Error('Dosya çok büyük.')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}
async function requestJson(url: string, method: string, body?: unknown): Promise<any> {
  const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
  return requestRaw(url, method, data, 'application/json')
}
async function requestBytes(url: string, data: Buffer) { await requestRaw(url, 'POST', data, 'application/octet-stream') }
async function requestRaw(urlValue: string, method: string, body?: Buffer, contentType?: string): Promise<any> {
  const url = new URL(urlValue)
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(url, { method, rejectUnauthorized: false, headers: { ...(contentType ? { 'Content-Type': contentType } : {}), ...(body ? { 'Content-Length': body.length } : {}) } }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        if ((response.statusCode || 500) >= 400) { reject(new Error(raw || 'HTTP ' + response.statusCode)); return }
        try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
      })
    })
    request.setTimeout(15_000, () => request.destroy(new Error('İstek zaman aşımına uğradı.')))
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

function renderCompanionHtml(deviceName: string, port: number): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Eon Yerel Panel</title>
  <style>
    :root {
      --bg: #0b0f17;
      --card: rgba(22, 29, 43, 0.8);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.25);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --danger: #ef4444;
      --success: #22c55e;
      --warning: #f59e0b;
      --radius: 14px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    
    /* AUTH SCREEN */
    #auth-view { display: none; min-height: 100vh; padding: 24px 16px; align-items: center; justify-content: center; }
    .auth-card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--card-border); border-radius: 20px; padding: 28px 22px; backdrop-filter: blur(16px); text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .auth-icon { width: 60px; height: 60px; border-radius: 16px; background: rgba(56, 189, 248, 0.12); color: var(--accent); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; border: 1px solid rgba(56, 189, 248, 0.25); }
    .auth-card h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 6px; }
    .auth-card p { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 20px; }
    .pin-input { width: 100%; height: 52px; background: rgba(0,0,0,0.35); border: 2px solid rgba(255,255,255,0.12); border-radius: 12px; color: var(--text); font-size: 1.4rem; font-weight: 700; text-align: center; letter-spacing: 4px; text-transform: uppercase; outline: none; margin-bottom: 16px; transition: border-color 0.2s; }
    .pin-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
    .auth-error { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-size: 0.82rem; padding: 10px; border-radius: 10px; margin-bottom: 14px; display: none; }
    
    /* MAIN APP */
    #app-view { display: none; flex-direction: column; min-height: 100vh; padding-bottom: 70px; }
    header {
      padding: 14px 18px;
      background: rgba(11, 15, 23, 0.88);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-brand h1 { font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .header-right { display: flex; align-items: center; gap: 10px; }
    .status-badge { font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; background: rgba(34, 197, 94, 0.15); color: var(--success); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
    .btn-logout { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.78rem; padding: 4px 8px; border-radius: 6px; }
    .btn-logout:hover { color: var(--danger); background: rgba(239, 68, 68, 0.1); }
    
    .tabs { display: flex; background: rgba(255,255,255,0.04); padding: 4px; margin: 14px 16px 8px; border-radius: 12px; border: 1px solid var(--card-border); }
    .tab-btn { flex: 1; padding: 9px 4px; background: transparent; border: none; color: var(--text-muted); font-size: 0.82rem; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
    .tab-btn.active { background: var(--card); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .container { padding: 10px 16px; flex: 1; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    
    .card { background: var(--card); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; backdrop-filter: blur(8px); }
    .card-title { font-size: 0.95rem; font-weight: 600; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; border-radius: 10px; border: none; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: all 0.15s; text-decoration: none; }
    .btn-primary { background: var(--accent); color: #0b0f17; box-shadow: 0 4px 12px var(--accent-glow); }
    .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text); }
    .btn-danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .btn-full { width: 100%; margin-top: 8px; }
    
    /* NOTIFICATION FILTERS */
    .filter-scroll { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 10px; scrollbar-width: none; }
    .filter-scroll::-webkit-scrollbar { display: none; }
    .filter-pill { font-size: 0.75rem; font-weight: 600; padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--card-border); white-space: nowrap; cursor: pointer; }
    .filter-pill.active { background: rgba(56, 189, 248, 0.18); color: var(--accent); border-color: rgba(56, 189, 248, 0.35); }
    
    .search-input { width: 100%; height: 38px; background: rgba(0,0,0,0.25); border: 1px solid var(--card-border); border-radius: 8px; color: var(--text); padding: 0 12px; font-size: 0.82rem; margin-bottom: 12px; outline: none; }
    .search-input:focus { border-color: var(--accent); }
    
    .notif-item { background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; margin-bottom: 8px; animation: slideIn 0.2s ease-out; }
    @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .notif-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .notif-app { font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: var(--accent); }
    .notif-time { font-size: 0.7rem; color: var(--text-muted); }
    .notif-title { font-size: 0.88rem; font-weight: 600; margin-bottom: 2px; }
    .notif-body { font-size: 0.8rem; color: var(--text-muted); line-height: 1.35; word-break: break-word; }
    
    .upload-box { border: 2px dashed rgba(56, 189, 248, 0.35); border-radius: var(--radius); padding: 28px 16px; text-align: center; cursor: pointer; transition: all 0.2s; background: rgba(56, 189, 248, 0.02); }
    .upload-box:hover, .upload-box:active { border-color: var(--accent); background: rgba(56, 189, 248, 0.06); }
    .progress-bar { width: 100%; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 12px; display: none; }
    .progress-fill { height: 100%; width: 0%; background: var(--accent); transition: width 0.1s; }
    .textarea { width: 100%; height: 90px; background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); border-radius: 10px; color: var(--text); padding: 12px; font-size: 0.88rem; resize: none; outline: none; }
    .textarea:focus { border-color: var(--accent); }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .empty-state { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 0.85rem; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.85rem; }
  </style>
</head>
<body>

  <!-- SCREEN 1: PIN AUTHENTICATION GATE -->
  <div id="auth-view">
    <div class="auth-card">
      <div class="auth-icon">🔒</div>
      <h2>${deviceName}</h2>
      <p>Bilgisayar ekranındaki <strong>Eşleştirme Kodunu</strong> girerek bağlanın.</p>
      
      <div class="auth-error" id="auth-error">Hatalı kod! Lütfen kontrol edin.</div>
      
      <input type="text" id="pin-input" class="pin-input" placeholder="KAP-XXXX" maxlength="12" autofocus autocomplete="off" />
      <button class="btn btn-primary btn-full" id="auth-btn" onclick="submitPairing()">Eşleştir ve Bağlan</button>
    </div>
  </div>

  <!-- SCREEN 2: MAIN DASHBOARD -->
  <div id="app-view">
    <header>
      <div class="header-brand">
        <h1>Eon <span style="font-weight:400; font-size:0.82rem; color:var(--text-muted);">Yerel</span></h1>
      </div>
      <div class="header-right">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span id="pc-name-display">${deviceName}</span>
        </div>
        <button class="btn-logout" onclick="logout()" title="Eşleştirmeyi Kaldır">Çıkış</button>
      </div>
    </header>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('notifications')">🔔 Bildirimler <span id="notif-count-badge"></span></button>
      <button class="tab-btn" onclick="switchTab('power')">⚡ Güç</button>
      <button class="tab-btn" onclick="switchTab('upload')">📁 Dosya & Pano</button>
    </div>

    <main class="container">
      <!-- TAB 1: NOTIFICATIONS -->
      <section id="tab-notifications" class="tab-content active">
        <div class="card">
          <div class="card-title">
            <span>PC Bildirim Aynalama</span>
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;" onclick="clearNotifs()">Temizle</button>
          </div>
          <div class="toggle-row">
            <span>Telefonda Pop-up Bildirim</span>
            <button class="btn btn-secondary" style="padding:5px 10px; font-size:0.78rem;" id="perm-btn" onclick="requestNotificationPermission()">İzni Aç</button>
          </div>
          <div class="toggle-row">
            <span>Bildirim Sesi</span>
            <input type="checkbox" id="sound-toggle" checked style="accent-color:var(--accent); width:18px; height:18px;" />
          </div>
        </div>

        <!-- Filter Chips -->
        <div class="filter-scroll" id="filter-container">
          <button class="filter-pill active" onclick="setFilter('all')">Tümü</button>
          <button class="filter-pill" onclick="setFilter('WhatsApp')">WhatsApp</button>
          <button class="filter-pill" onclick="setFilter('Discord')">Discord</button>
          <button class="filter-pill" onclick="setFilter('Chrome')">Chrome</button>
          <button class="filter-pill" onclick="setFilter('Outlook')">Outlook</button>
          <button class="filter-pill" onclick="setFilter('Sistem')">Sistem</button>
        </div>

        <input type="text" class="search-input" id="search-input" placeholder="Bildirimlerde ara..." oninput="handleSearch(this.value)" />

        <div id="notif-list">
          <div class="empty-state" id="notif-empty">
            <div style="font-size: 1.8rem; margin-bottom: 6px;">🔔</div>
            PC'ye bildirim geldiğinde burada anlık görünecektir.<br>Uygulama arka plandayken de aktiftir.
          </div>
        </div>
      </section>

      <!-- TAB 2: POWER -->
      <section id="tab-power" class="tab-content">
        <div class="card">
          <div class="card-title">Windows Güç Kontrolleri</div>
          <div class="grid-2">
            <button class="btn btn-danger" onclick="sendCommand('shutdown', 0)">🔴 Şimdi Kapat</button>
            <button class="btn btn-secondary" onclick="sendCommand('restart', 0)">🔄 Yeniden Başlat</button>
          </div>
          <div class="grid-2" style="margin-top:8px;">
            <button class="btn btn-secondary" onclick="sendCommand('shutdown', 1800)">⏳ 30 Dk Sonra Kapat</button>
            <button class="btn btn-secondary" onclick="sendCommand('shutdown', 3600)">⏳ 1 Saat Sonra Kapat</button>
          </div>
          <button class="btn btn-secondary btn-full" style="margin-top:10px;" onclick="sendCommand('cancel', 0)">❌ Aktif Planı İptal Et</button>
          <div id="power-status" style="margin-top:10px; font-size:0.82rem; text-align:center;"></div>
        </div>
      </section>

      <!-- TAB 3: FILE & CLIPBOARD -->
      <section id="tab-upload" class="tab-content">
        <div class="card">
          <div class="card-title">Bilgisayara Dosya Gönder</div>
          <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">
            Dosyalarınız doğrudan PC'deki <strong>İndirilenler/kapanis_received</strong> klasörüne aktarılır.
          </p>

          <div class="upload-box" onclick="document.getElementById('file-input').click()">
            <div style="font-size: 2rem; margin-bottom: 6px;">📤</div>
            <div style="font-weight:600; font-size:0.9rem; margin-bottom:2px;">Fotoğraf veya Dosya Seç</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Dokunun veya sürükleyip bırakın</div>
            <input type="file" id="file-input" multiple style="display:none" onchange="handleFiles(this.files)">
          </div>

          <div class="progress-bar" id="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <div id="upload-status" style="margin-top:10px; font-size:0.82rem; text-align:center;"></div>
        </div>

        <div class="card">
          <div class="card-title">PC Panosuna Metin Gönder</div>
          <textarea id="clip-text" class="textarea" placeholder="Buraya link, not veya metin yapıştırın..."></textarea>
          <button class="btn btn-primary btn-full" onclick="sendClipboard()">PC'ye Gönder</button>
          <div id="clip-status" style="margin-top:8px; font-size:0.8rem; text-align:center;"></div>
        </div>
      </section>
    </main>
  </div>

  <script>
    let authToken = localStorage.getItem('kapanis_local_token') || '';
    const allNotifications = [];
    let currentFilter = 'all';
    let searchQuery = '';

    function checkAuth() {
      const params = new URLSearchParams(window.location.search);
      const pairData = params.get('pair_data');
      if (pairData) {
        try {
          let raw = pairData.trim().replace(/-/g, '+').replace(/_/g, '/');
          while (raw.length % 4) raw += '=';
          const decoded = decodeURIComponent(escape(atob(raw)));
          const obj = JSON.parse(decoded);
          if (obj && (obj.code || obj.secret)) {
            const pinEl = document.getElementById('pin-input');
            if (pinEl && !pinEl.value) {
              pinEl.value = (obj.code || obj.secret).toUpperCase();
            }
          }
        } catch {}
      }

      if (!authToken) {
        document.getElementById('auth-view').style.display = 'flex';
        document.getElementById('app-view').style.display = 'none';
      } else {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('app-view').style.display = 'flex';
        connectSse();
      }
    }

    async function submitPairing() {
      const pin = document.getElementById('pin-input').value.trim();
      const errEl = document.getElementById('auth-error');
      const btn = document.getElementById('auth-btn');
      if (!pin) return;
      
      btn.disabled = true;
      btn.textContent = 'Eşleştiriliyor...';
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/auth/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairingCode: pin, deviceName: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Android') ? 'Android' : 'Tarayıcı' })
        });
        const json = await res.json();
        if (json.success && json.authToken) {
          authToken = json.authToken;
          localStorage.setItem('kapanis_local_token', authToken);
          if (json.deviceName) document.getElementById('pc-name-display').textContent = json.deviceName;
          checkAuth();
        } else {
          errEl.textContent = json.error || 'Hatalı eşleştirme kodu!';
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.textContent = 'PC ile bağlantı kurulamadı.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Eşleştir ve Bağlan';
      }
    }

    function logout() {
      if (confirm('Bu cihazın eşleştirmesini kaldırmak istiyor musunuz?')) {
        localStorage.removeItem('kapanis_local_token');
        authToken = '';
        checkAuth();
      }
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabId));
      });
      document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.toggle('active', el.id === 'tab-' + tabId);
      });
    }

    function playChime() {
      if (!document.getElementById('sound-toggle').checked) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } catch (e) {}
    }

    function requestNotificationPermission() {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(perm => {
        updatePermButton();
        if (perm === 'granted') {
          new Notification('Eon Yerel', { body: 'PC bildirimleri telefonunuza başarıyla bağlandı!' });
        }
      });
    }

    function updatePermButton() {
      const btn = document.getElementById('perm-btn');
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        btn.textContent = '✓ İzin Verildi';
        btn.style.color = 'var(--success)';
        btn.disabled = true;
      }
    }
    updatePermButton();

    function addNotification(item) {
      if (allNotifications.some(n => n.id === item.id)) return;
      allNotifications.unshift(item);
      playChime();

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(item.appName || 'PC Bildirimi', {
            body: (item.title ? item.title + ': ' : '') + (item.body || '')
          });
        } catch (e) {}
      }

      renderNotifications();
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(filter));
      });
      renderNotifications();
    }

    function handleSearch(query) {
      searchQuery = (query || '').toLowerCase().trim();
      renderNotifications();
    }

    function renderNotifications() {
      const list = document.getElementById('notif-list');
      const empty = document.getElementById('notif-empty');
      
      const filtered = allNotifications.filter(n => {
        if (currentFilter !== 'all' && !(n.appName || '').toLowerCase().includes(currentFilter.toLowerCase())) {
          return false;
        }
        if (searchQuery) {
          const matchTitle = (n.title || '').toLowerCase().includes(searchQuery);
          const matchBody = (n.body || '').toLowerCase().includes(searchQuery);
          const matchApp = (n.appName || '').toLowerCase().includes(searchQuery);
          return matchTitle || matchBody || matchApp;
        }
        return true;
      });

      if (filtered.length === 0) {
        empty.style.display = 'block';
        list.innerHTML = '';
        list.appendChild(empty);
        return;
      }
      empty.style.display = 'none';
      list.innerHTML = filtered.map(n => \`
        <div class="notif-item">
          <div class="notif-header">
            <span class="notif-app">\${escapeHtml(n.appName || 'Sistem')}</span>
            <span class="notif-time">\${new Date(n.timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          \${n.title ? \`<div class="notif-title">\${escapeHtml(n.title)}</div>\` : ''}
          \${n.body ? \`<div class="notif-body">\${escapeHtml(n.body)}</div>\` : ''}
        </div>
      \`).join('');
    }

    function clearNotifs() {
      allNotifications.length = 0;
      renderNotifications();
    }

    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function connectSse() {
      if (!authToken) return;
      const sse = new EventSource('/api/notifications/stream?token=' + encodeURIComponent(authToken));
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.title !== undefined) {
            addNotification(data);
          }
        } catch (e) {}
      };
      sse.onerror = () => {
        sse.close();
        setTimeout(connectSse, 4000);
      };
    }

    async function handleFiles(files) {
      if (!files || files.length === 0) return;
      const statusEl = document.getElementById('upload-status');
      const progressEl = document.getElementById('progress-bar');
      const fillEl = document.getElementById('progress-fill');
      progressEl.style.display = 'block';
      fillEl.style.width = '0%';
      statusEl.style.color = 'var(--text)';
      statusEl.textContent = files.length + ' dosya yükleniyor...';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload', true);
          xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
          xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              fillEl.style.width = percent + '%';
            }
          };
          await new Promise((resolve, reject) => {
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error('Yükleme hatası (' + xhr.status + ')'));
            xhr.onerror = () => reject(new Error('Ağ hatası'));
            xhr.send(file);
          });
        } catch (err) {
          statusEl.style.color = 'var(--danger)';
          statusEl.textContent = 'Hata: ' + (err.message || 'Dosya gönderilemedi');
          return;
        }
      }

      fillEl.style.width = '100%';
      statusEl.style.color = 'var(--success)';
      statusEl.textContent = '✓ ' + files.length + ' dosya başarıyla PC\\\'ye aktarıldı!';
      setTimeout(() => { progressEl.style.display = 'none'; }, 2500);
    }

    async function sendClipboard() {
      const text = document.getElementById('clip-text').value.trim();
      const status = document.getElementById('clip-status');
      if (!text) return;
      try {
        const res = await fetch('/api/clipboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ text })
        });
        if (res.ok) {
          status.style.color = 'var(--success)';
          status.textContent = '✓ Metin PC panosuna iletildi!';
          document.getElementById('clip-text').value = '';
          setTimeout(() => { status.textContent = ''; }, 3000);
        } else {
          status.style.color = 'var(--danger)';
          status.textContent = 'Gönderilemedi.';
        }
      } catch {
        status.style.color = 'var(--danger)';
        status.textContent = 'Bağlantı hatası.';
      }
    }

    async function sendCommand(command, delaySeconds) {
      const status = document.getElementById('power-status');
      if (command !== 'cancel' && !confirm('Bu güç komutu uygulansın mı?')) return;
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ command, delaySeconds })
        });
        const json = await res.json();
        if (json.success) {
          status.style.color = 'var(--success)';
          status.textContent = '✓ Komut başarıyla uygulandı!';
          setTimeout(() => { status.textContent = ''; }, 3000);
        } else {
          status.style.color = 'var(--danger)';
          status.textContent = json.error || 'Komut başarısız.';
        }
      } catch {
        status.style.color = 'var(--danger)';
        status.textContent = 'Bağlantı hatası.';
      }
    }

    checkAuth();
  </script>
</body>
</html>`
}
