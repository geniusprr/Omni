import { BrowserWindow, desktopCapturer, ipcMain, powerMonitor, screen, session as electronSession, webContents } from 'electron'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import type { AppSettings, RemoteDesktopInput, RemoteDesktopStatus, RemoteDisplayInfo, RemoteTrustedDevice } from '../src/types.js'
import { WindowsInputInjector } from './WindowsInputInjector.js'

interface RemoteDesktopOptions {
  getSettings: () => AppSettings | null
  authorize: (request: IncomingMessage, url?: URL) => RemoteTrustedDevice | null
  revokeTrustedDevice: (id: string) => boolean
  emit: (status: RemoteDesktopStatus) => void
  preloadPath: string
  captureUrl: string
}

interface ActiveSession {
  id: string
  sessionToken: string
  controllerId: string
  controllerName: string
  createdAt: number
  lastHeartbeat: number
  lastSequence: number
  lastInputAt: number
  captureReady: boolean
  pendingSignals: JsonRecord[]
  display: RemoteDisplayInfo
  ws: WebSocket | null
}

interface JsonRecord {
  [key: string]: unknown
}

const SESSION_TOKEN_TTL_MS = 60_000
const HEARTBEAT_TIMEOUT_MS = 15_000
const MAX_SIGNAL_BYTES = 64 * 1024
const MAX_INPUT_TEXT = 4_096

export class RemoteDesktopManager {
  private readonly options: RemoteDesktopOptions
  private readonly input = new WindowsInputInjector()
  private readonly wsServer = new WebSocketServer({ noServer: true, maxPayload: MAX_SIGNAL_BYTES })
  private activeSession: ActiveSession | null = null
  private captureWindow: BrowserWindow | null = null
  private captureSourceId: string | null = null
  private captureStarting = false
  private enabledOverride: boolean | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null

  private readonly onCaptureSignal = (event: Electron.IpcMainEvent, payload: unknown) => {
    if (!this.captureWindow || event.sender !== this.captureWindow.webContents) return
    this.handleCaptureSignal(payload)
  }

  private readonly onCaptureInput = (event: Electron.IpcMainEvent, payload: unknown) => {
    if (!this.captureWindow || event.sender !== this.captureWindow.webContents) return
    this.handleCaptureInput(payload)
  }

  private readonly onSecureDesktop = () => {
    if (this.activeSession) void this.closeSession('secure-desktop')
  }

  private readonly onDisplayChanged = () => {
    if (this.activeSession) void this.closeSession('display-changed')
  }

  private readonly onDisplayMediaRequest = (
    request: Electron.DisplayMediaRequestHandlerHandlerRequest,
    callback: (streams: Electron.Streams) => void,
  ) => {
    const capture = this.captureWindow
    const sourceId = this.captureSourceId
    const requestingContents = request.frame ? webContents.fromFrame(request.frame) : undefined
    if (!capture || capture.isDestroyed() || !this.activeSession || requestingContents !== capture.webContents || !sourceId) {
      callback({})
      return
    }

    void desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    }).then((sources) => {
      const source = sources.find((item) => item.id === sourceId)
      callback(source ? { video: source } : {})
    }).catch(() => callback({}))
  }

  constructor(options: RemoteDesktopOptions) {
    this.options = options
    ipcMain.on('remote-capture:signal', this.onCaptureSignal)
    ipcMain.on('remote-capture:input', this.onCaptureInput)
    powerMonitor.on('lock-screen', this.onSecureDesktop)
    powerMonitor.on('suspend', this.onSecureDesktop)
    screen.on('display-metrics-changed', this.onDisplayChanged)
    electronSession.defaultSession.setDisplayMediaRequestHandler(this.onDisplayMediaRequest)
    this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), 5_000)
    this.heartbeatTimer.unref?.()
  }

  getStatus(): RemoteDesktopStatus {
    const enabled = this.isEnabled()
    const active = this.activeSession
    return {
      state: !enabled ? 'disabled' : active?.ws ? 'connected' : active ? 'connecting' : 'ready',
      sessionId: active?.id || null,
      controllerId: active?.controllerId || null,
      controllerName: active?.controllerName || null,
      display: active?.display || (enabled ? this.getDisplayInfo() : null),
      lastError: null,
    }
  }

  setEnabled(enabled: boolean) {
    this.enabledOverride = enabled
    if (!enabled && this.activeSession) void this.closeSession('disabled')
    this.emitStatus()
    return enabled
  }

  handleRequest = async (request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> => {
    if (!url.pathname.startsWith('/api/remote/')) return false

    if (!isPrivateLanAddress(request.socket.remoteAddress || '')) {
      sendJson(response, { success: false, error: 'PC Ekranı yalnızca aynı özel yerel ağda kullanılabilir.' }, 403)
      return true
    }

    if (request.method === 'GET' && url.pathname === '/api/remote/capture') {
      if (!isLoopbackAddress(request.socket.remoteAddress || '') || !this.activeSession) {
        sendJson(response, { success: false, error: 'Capture sayfası bulunamadı.' }, 404)
        return true
      }
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end(CAPTURE_HTML)
      return true
    }

    if (request.method === 'POST' && url.pathname === '/api/remote/session') {
      if (process.platform !== 'win32') {
        sendJson(response, { success: false, error: 'PC Ekranı yalnızca Windows masaüstünde kullanılabilir.' }, 501)
        return true
      }
      if (!this.isEnabled()) {
        sendJson(response, { success: false, error: 'PC Ekranı masaüstü ayarlarından devre dışı bırakılmış.' }, 403)
        return true
      }

      const trusted = this.authorizeRemoteRequest(request)
      if (!trusted) {
        sendJson(response, { success: false, error: 'Bu oturum için güvenilir cihaz doğrulaması gerekiyor.', requiresAuth: true }, 401)
        return true
      }

      if (this.activeSession && Date.now() - this.activeSession.lastHeartbeat <= HEARTBEAT_TIMEOUT_MS) {
        sendJson(response, {
          success: false,
          error: 'Bu PC başka bir mobil cihaz tarafından kontrol ediliyor.',
          sessionId: this.activeSession.id,
          controllerName: this.activeSession.controllerName,
        }, 409)
        return true
      }
      if (this.activeSession) await this.closeSession('stale')

      const body = await readJson(request, 32 * 1024)
      await this.createSessionResponse(response, trusted, body)
      return true
    }

    const takeoverMatch = /^\/api\/remote\/session\/([^/]+)\/takeover$/.exec(url.pathname)
    if (request.method === 'POST' && takeoverMatch) {
      const trusted = this.authorizeRemoteRequest(request)
      if (!trusted || !this.activeSession || this.activeSession.id !== takeoverMatch[1]) {
        sendJson(response, { success: false, error: 'Devralınacak aktif oturum bulunamadı.' }, 404)
        return true
      }
      await this.closeSession('takeover')
      const body = await readJson(request, 32 * 1024)
      await this.createSessionResponse(response, trusted, body)
      return true
    }

    const closeMatch = /^\/api\/remote\/session\/([^/]+)\/close$/.exec(url.pathname)
    if (request.method === 'POST' && closeMatch) {
      const trusted = this.authorizeRemoteRequest(request)
      if (!trusted || !this.activeSession || this.activeSession.id !== closeMatch[1]) {
        sendJson(response, { success: false, error: 'Oturum bulunamadı.' }, 404)
        return true
      }
      await this.closeSession('client-request')
      sendJson(response, { success: true })
      return true
    }

    if (request.method === 'POST' && url.pathname === '/api/remote/trusted/revoke-self') {
      const trusted = this.authorizeRemoteRequest(request)
      if (!trusted) {
        sendJson(response, { success: false, error: 'Yetkisiz istek.' }, 401)
        return true
      }
      if (this.activeSession?.controllerId === trusted.controllerId) await this.closeSession('device-revoked')
      const revoked = this.options.revokeTrustedDevice(trusted.id)
      sendJson(response, { success: revoked })
      return true
    }

    if (request.method === 'GET' && url.pathname === '/api/remote/status') {
      if (!this.authorizeRemoteRequest(request)) {
        sendJson(response, { success: false, error: 'Yetkisiz istek.' }, 401)
        return true
      }
      sendJson(response, { success: true, ...this.getStatus() })
      return true
    }

    sendJson(response, { success: false, error: 'Remote-desktop endpoint bulunamadı.' }, 404)
    return true
  }

  handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    const match = /^\/api\/remote\/session\/([^/]+)\/signal$/.exec(url.pathname)
    const session = this.activeSession
    const sessionHeader = request.headers['x-kapanis-session']
    const sessionToken = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader || ''

    if (!match || !session || session.id !== match[1] || !isPrivateLanAddress(request.socket.remoteAddress || '')) {
      socket.destroy()
      return
    }
    if (!this.authorizeRemoteRequest(request) || session.sessionToken !== sessionToken || Date.now() - session.createdAt > SESSION_TOKEN_TTL_MS) {
      socket.destroy()
      return
    }
    session.sessionToken = ''
    this.wsServer.handleUpgrade(request, socket, head, (ws) => this.handleWebSocket(ws, session))
  }

  listTrustedDevices() {
    return [] as RemoteTrustedDevice[]
  }

  async stopSession() {
    await this.closeSession('desktop-request')
    return true
  }

  async dispose() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    powerMonitor.removeListener('lock-screen', this.onSecureDesktop)
    powerMonitor.removeListener('suspend', this.onSecureDesktop)
    screen.removeListener('display-metrics-changed', this.onDisplayChanged)
    ipcMain.removeListener('remote-capture:signal', this.onCaptureSignal)
    ipcMain.removeListener('remote-capture:input', this.onCaptureInput)
    await this.closeSession('shutdown')
    electronSession.defaultSession.setDisplayMediaRequestHandler(null)
    await new Promise<void>((resolve) => this.wsServer.close(() => resolve()))
  }

  private handleWebSocket(ws: WebSocket, session: ActiveSession) {
    session.ws = ws
    session.lastHeartbeat = Date.now()
    this.emitStatus()
    ws.send(JSON.stringify({ version: 1, type: 'state', state: 'connecting' }))
    void this.ensureCapture(session)

    ws.on('message', (raw) => {
      if (raw.toString('utf8').length > MAX_SIGNAL_BYTES) return
      let message: JsonRecord
      try { message = JSON.parse(raw.toString('utf8')) as JsonRecord } catch { return }
      if (message.version !== 1 || typeof message.type !== 'string') return
      session.lastHeartbeat = Date.now()
      if (message.type === 'heartbeat') {
        ws.send(JSON.stringify({ version: 1, type: 'state', state: 'connected' }))
        return
      }
      if (message.type === 'close') {
        void this.closeSession('client-close')
        return
      }
      if (message.type === 'offer' || message.type === 'ice') {
        const signal = { sessionId: session.id, ...message }
        if (!session.captureReady || !this.captureWindow) {
          if (session.pendingSignals.length < 16) session.pendingSignals.push(signal)
        } else {
          this.captureWindow.webContents.send('remote-capture:signal', signal)
        }
      }
    })
    ws.on('close', () => {
      if (this.activeSession?.id === session.id) void this.closeSession('socket-closed')
    })
    ws.on('error', () => {
      if (this.activeSession?.id === session.id) void this.closeSession('socket-error')
    })
  }

  private async createSessionResponse(response: ServerResponse, trusted: RemoteTrustedDevice, body: JsonRecord) {
    const controllerId = typeof body.controllerId === 'string' && body.controllerId.trim()
      ? body.controllerId.trim()
      : trusted.controllerId
    const controllerName = typeof body.controllerName === 'string' && body.controllerName.trim()
      ? body.controllerName.trim().slice(0, 80)
      : trusted.controllerName
    if (trusted.controllerId && !trusted.controllerId.startsWith('legacy-') && controllerId !== trusted.controllerId) {
      sendJson(response, { success: false, error: 'Mobil cihaz kimliği doğrulanamadı.' }, 403)
      return
    }

    const display = this.getDisplayInfo()
    const session: ActiveSession = {
      id: randomUUID(),
      sessionToken: randomUUID() + randomUUID(),
      controllerId,
      controllerName,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      lastSequence: -1,
      lastInputAt: 0,
      captureReady: false,
      pendingSignals: [],
      display,
      ws: null,
    }
    this.activeSession = session
    this.input.setDisplay({ ...screen.getPrimaryDisplay().bounds })
    this.emitStatus()
    sendJson(response, {
      version: 1,
      success: true,
      sessionId: session.id,
      sessionToken: session.sessionToken,
      expiresAt: Date.now() + SESSION_TOKEN_TTL_MS,
      display,
      iceServers: [],
      wsPath: `/api/remote/session/${session.id}/signal`,
    })
  }

  private async ensureCapture(session: ActiveSession) {
    if (this.captureWindow || this.captureStarting || this.activeSession?.id !== session.id) return
    this.captureStarting = true
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 }, fetchWindowIcons: false })
      const display = screen.getPrimaryDisplay()
      const source = sources.find((item) => item.display_id === String(display.id)) || sources[0]
      if (!source) throw new Error('Ana monitör yakalama kaynağı bulunamadı.')
      this.captureSourceId = source.id

      const capture = new BrowserWindow({
        width: 2,
        height: 2,
        show: false,
        frame: false,
        skipTaskbar: true,
        webPreferences: {
          preload: this.options.preloadPath,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
        },
      })
      this.captureWindow = capture
      capture.on('closed', () => {
        if (this.captureWindow === capture) this.captureWindow = null
        if (this.captureSourceId === source.id) this.captureSourceId = null
        if (this.activeSession?.id === session.id) void this.closeSession('capture-closed')
      })
      await capture.loadURL(this.options.captureUrl)
      if (this.activeSession?.id === session.id && !capture.isDestroyed()) {
        capture.webContents.send('remote-capture:start', { sessionId: session.id, sourceId: source.id })
      }
    } catch (error) {
      console.error('[remote-desktop] screen capture failed', error)
      if (this.activeSession?.id === session.id) {
        this.sendState('failed', error instanceof Error ? error.message : 'Ekran yakalama başlatılamadı.')
        await this.closeSession('capture-error')
      }
    } finally {
      this.captureStarting = false
    }
  }

  private handleCaptureSignal(payload: unknown) {
    const item = payload && typeof payload === 'object' ? payload as JsonRecord : null
    const session = this.activeSession
    if (!item || !session || item.sessionId !== session.id || !session.ws || session.ws.readyState !== WebSocket.OPEN) return
    const type = item.type
    if (type === 'answer' && typeof item.sdp === 'string') {
      session.ws.send(JSON.stringify({ version: 1, type: 'answer', sdp: item.sdp }))
      return
    }
    if (type === 'ice' && item.candidate && typeof item.candidate === 'object') {
      session.ws.send(JSON.stringify({ version: 1, type: 'ice', candidate: item.candidate }))
      return
    }
    if (type === 'state' && typeof item.state === 'string') {
      if (item.state === 'ready') {
        session.captureReady = true
        const pending = session.pendingSignals.splice(0)
        if (this.captureWindow && this.activeSession?.id === session.id) {
          for (const signal of pending) this.captureWindow.webContents.send('remote-capture:signal', signal)
        }
        return
      }
      if (item.state === 'connected') this.emitStatus()
      session.ws.send(JSON.stringify({ version: 1, type: 'state', state: item.state, reason: item.reason || null }))
      if (item.state === 'failed' || item.state === 'closed') void this.closeSession(String(item.reason || item.state))
    }
  }

  private handleCaptureInput(payload: unknown) {
    const item = payload && typeof payload === 'object' ? payload as JsonRecord : null
    const session = this.activeSession
    if (!item || !session || item.sessionId !== session.id) return
    const input = item.input as Partial<RemoteDesktopInput> | undefined
    if (!input || input.version !== 1 || typeof input.sequence !== 'number' || !Number.isInteger(input.sequence)) return
    if (input.sequence <= session.lastSequence) return
    session.lastSequence = input.sequence
    const now = Date.now()
    const minimumInterval = input.type === 'move' || input.type === 'moveRelative' ? 16 : input.type === 'wheel' ? 20 : 0
    if (minimumInterval > 0 && now - session.lastInputAt < minimumInterval) return
    if (minimumInterval > 0) session.lastInputAt = now
    if (input.type === 'move' && typeof input.x === 'number' && typeof input.y === 'number' && input.x >= 0 && input.x <= 1 && input.y >= 0 && input.y <= 1) {
      this.input.move(input.x, input.y)
    } else if (
      input.type === 'moveRelative'
      && typeof input.dx === 'number'
      && typeof input.dy === 'number'
      && Number.isFinite(input.dx)
      && Number.isFinite(input.dy)
      && Math.abs(input.dx) <= 128
      && Math.abs(input.dy) <= 128
    ) {
      this.input.moveRelative(input.dx, input.dy)
    } else if (input.type === 'button' && (input.button === 'left' || input.button === 'right' || input.button === 'middle') && typeof input.pressed === 'boolean') {
      this.input.button(input.button, input.pressed)
    } else if (input.type === 'wheel' && typeof input.deltaX === 'number' && typeof input.deltaY === 'number') {
      this.input.wheel(input.deltaX, input.deltaY)
    } else if (input.type === 'key' && typeof input.code === 'string' && input.code.length <= 32 && typeof input.pressed === 'boolean') {
      this.input.key(input.code, input.pressed)
    } else if (input.type === 'text' && typeof input.value === 'string' && input.value.length <= MAX_INPUT_TEXT) {
      this.input.text(input.value)
    } else if (input.type === 'releaseAll') {
      this.input.releaseAll()
    }
  }

  private async closeSession(reason: string) {
    const session = this.activeSession
    if (!session) return
    this.activeSession = null
    this.input.releaseAll()
    try { session.ws?.send(JSON.stringify({ version: 1, type: 'close', reason })) } catch {}
    try { session.ws?.close() } catch {}
    const capture = this.captureWindow
    this.captureWindow = null
    this.captureSourceId = null
    if (capture && !capture.isDestroyed()) {
      try { capture.destroy() } catch {}
    }
    this.emitStatus()
  }

  private checkHeartbeat() {
    if (this.activeSession && Date.now() - this.activeSession.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      void this.closeSession('heartbeat-timeout')
    }
  }

  private sendState(state: string, reason?: string) {
    try { this.activeSession?.ws?.send(JSON.stringify({ version: 1, type: 'state', state, reason: reason || null })) } catch {}
  }

  private isEnabled() {
    return this.enabledOverride !== false && this.options.getSettings()?.remoteDesktopEnabled !== false
  }

  private authorizeRemoteRequest(request: IncomingMessage) {
    const authorization = request.headers.authorization
    if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) return null
    return this.options.authorize(request)
  }

  private getDisplayInfo(): RemoteDisplayInfo {
    const display = screen.getPrimaryDisplay()
    return {
      width: Math.max(1, Math.round(display.bounds.width)),
      height: Math.max(1, Math.round(display.bounds.height)),
      scaleFactor: display.scaleFactor || 1,
    }
  }

  private emitStatus() {
    this.options.emit(this.getStatus())
  }
}

const CAPTURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script>
(() => {
  const bridge = window.kapanisCapture;
  let peer = null;
  let stream = null;
  let inputChannel = null;
  let currentSessionId = '';

  function sendSignal(payload) { bridge.sendSignal(payload); }
  function sendState(state, reason) { sendSignal({ sessionId: currentSessionId, type: 'state', state, reason: reason || null }); }

  async function start(config) {
    currentSessionId = config.sessionId;
    peer = new RTCPeerConnection({ iceServers: [] });
    if (!navigator.mediaDevices) throw new Error("Electron medya yakalama API'si kullanılamıyor.");
    const legacyCapture = () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: config.sourceId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30
      }}
    });
    if (typeof navigator.mediaDevices.getDisplayMedia === 'function') {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: {
            width: { max: 1920 },
            height: { max: 1080 },
            frameRate: { max: 30 }
          }
        });
      } catch (displayError) {
        try {
          stream = await legacyCapture();
        } catch (legacyError) {
          throw new Error((legacyError && legacyError.message) || (displayError && displayError.message) || 'Ekran yakalama izni alınamadı.');
        }
      }
    } else {
      stream = await legacyCapture();
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('Ekran yakalama video track üretmedi.');
    if (videoTrack) videoTrack.onended = () => sendState('closed', 'Ekran yakalama durdu.');
    peer.addTrack(videoTrack, stream);
    const attachInputChannel = (channel) => {
      inputChannel = channel;
      inputChannel.onmessage = (event) => {
        try { bridge.sendInput({ sessionId: currentSessionId, input: JSON.parse(event.data) }); } catch {}
      };
    };
    peer.ondatachannel = (event) => attachInputChannel(event.channel);
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ sessionId: currentSessionId, type: 'ice', candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
    };
    peer.onconnectionstatechange = () => sendState(peer.connectionState, peer.connectionState === 'failed' ? 'WebRTC bağlantısı başarısız.' : undefined);
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'disconnected') sendState('failed', 'ICE bağlantısı koptu.');
    };
    sendState('ready');
  }

  bridge.onStart((config) => { start(config).catch((error) => sendState('failed', error && error.message ? error.message : 'Capture başlatılamadı.')); });
  bridge.onSignal(async (message) => {
    if (!peer || message.sessionId !== currentSessionId) return;
    try {
      if (message.type === 'offer') {
        await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp });
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({ sessionId: currentSessionId, type: 'answer', sdp: answer.sdp });
      } else if (message.type === 'ice' && message.candidate) {
        await peer.addIceCandidate(message.candidate);
      }
    } catch (error) {
      sendState('failed', error && error.message ? error.message : 'WebRTC signaling başarısız.');
    }
  });
})();
</script></body></html>`

async function readJson(request: IncomingMessage, maxBytes: number): Promise<JsonRecord> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    total += bytes.length
    if (total > maxBytes) throw new Error('Remote-desktop isteği çok büyük.')
    chunks.push(bytes)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
  } catch {
    return {}
  }
}

function sendJson(response: ServerResponse, value: unknown, status = 200) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(value))
}

function isPrivateLanAddress(rawAddress: string) {
  const address = rawAddress.split('%')[0].replace(/^::ffff:/, '').toLowerCase()
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
  const octets = address.split('.').map((value) => Number(value))
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [first, second] = octets
  return first === 10 || first === 127 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168
}

function isLoopbackAddress(rawAddress: string) {
  const address = rawAddress.split('%')[0].replace(/^::ffff:/, '').toLowerCase()
  return address === '::1' || address === '127.0.0.1'
}
