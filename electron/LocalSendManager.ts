import { app, Notification, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import https from 'node:https'
import dgram from 'node:dgram'
import { randomUUID } from 'node:crypto'
import type { ConnectionInfo, LocalSendDevice, LocalSendStatus, ReceivedFileRecord } from '../src/types.js'
import type { AlarmManager } from './AlarmManager.js'
import type { ContentManager } from './ContentManager.js'
import type { SystemManager } from './SystemManager.js'

interface UploadFile { id: string; fileName: string; size: number; fileType?: string }
interface UploadSession { sender: LocalSendDevice; files: Record<string, UploadFile>; tokens: Record<string, string>; createdAt: number }
interface MobileHooks { system: SystemManager; alarms: AlarmManager; content: ContentManager; emit: (event: string, payload: unknown) => void }

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
  private receivedFiles: ReceivedFileRecord[] = []
  private sessions = new Map<string, UploadSession>()
  private server: http.Server | null = null
  private autoAccept = true

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
    this.receivedFiles = readArray<ReceivedFileRecord>(this.filesPath).slice(0, 200)
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
    server.on('error', (error) => {
      if (this.server === server) this.server = null
      const code = (error as NodeJS.ErrnoException).code
      console.error(`[localsend] server failed${code ? ` (${code})` : ''}`, error)
    })
    server.listen(this.port, '0.0.0.0', () => console.info('[localsend] listening on ' + this.port))
  }

  stop() {
    this.server?.close()
    this.server = null
  }

  getStatus(): LocalSendStatus {
    const ips = localIps()
    return {
      isRunning: Boolean(this.server),
      localIp: ips[0] || '127.0.0.1',
      allIps: ips,
      port: this.port,
      alias: os.hostname() || 'Kapanış Desktop',
      fingerprint: 'kapanis-electron',
      autoAccept: this.autoAccept,
      downloadDir: this.downloadDir,
      discoveredCount: this.devices.size,
    }
  }

  getDevices() {
    const cutoff = Date.now() - 5 * 60_000
    return [...this.devices.values()].filter((device) => device.lastSeen > cutoff).sort((a, b) => b.lastSeen - a.lastSeen)
  }

  async scanNetwork() {
    const socket = dgram.createSocket('udp4')
    const message = Buffer.from(JSON.stringify({ type: 'kapanis-localsend-discovery', device: this.deviceInfo() }))
    await new Promise<void>((resolve) => {
      socket.once('error', () => { socket.close(); resolve() })
      socket.bind(() => {
        try { socket.setBroadcast(true); socket.send(message, this.port, '255.255.255.255', () => { socket.close(); resolve() }) } catch { socket.close(); resolve() }
      })
    })
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

  getConnectionInfo(): ConnectionInfo {
    const ips = localIps()
    const host = ips[0] || '127.0.0.1'
    return {
      port: this.port,
      ipAddresses: ips,
      deviceName: os.hostname() || 'Kapanış Desktop',
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
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
    const senderIp = request.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown'

    // Preserve the mobile companion API while keeping the actual state
    // mutations in dedicated managers.
    if (request.method === 'GET' && (url.pathname === '/api/status' || url.pathname === '/api/local/state')) {
      sendJson(response, { status: 'ok', deviceName: os.hostname() || 'Kapanış Desktop', version: '2.0.0', port: this.port, timerState: this.mobile.system.getTimerStatus(), alarms: this.mobile.alarms.list() })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/register') {
      const body = await readJson(request)
      const device = this.normalizeDevice(body, senderIp, Number(body?.port) || this.port, 'http')
      this.saveDevice(device)
      sendJson(response, { status: 'ok', deviceName: os.hostname() || 'Kapanış Desktop', version: '2.0.0', port: this.port, timerState: this.mobile.system.getTimerStatus(), alarms: this.mobile.alarms.list(), device: this.deviceInfo() })
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
      const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'kapanış. Mobil Bildirim'
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
    return {
      ip: localIps()[0] || '127.0.0.1',
      port: this.port,
      alias: os.hostname() || 'Kapanış Desktop',
      version: '1.0',
      deviceModel: 'Electron',
      deviceType: 'desktop',
      fingerprint: 'kapanis-electron',
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
  return Object.values(os.networkInterfaces()).flatMap((items) => (items || []).filter((item) => item.family === 'IPv4' && !item.internal).map((item) => item.address))
}

function sanitizeFilename(value: string) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'file-' + Date.now() }
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
