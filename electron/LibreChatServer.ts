import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AiConversation, AiMessage, AiProviderId, AiSendResult, AiSnapshot } from '../shared/contracts.js'
import { AiStore, type AiSendObserver } from './AiStore.js'

type CommittedTurn = Parameters<NonNullable<AiSendObserver['onUserCommitted']>>[0]

type PendingGeneration = {
  payload: Record<string, unknown>
  startedAt: number
  runId: string
  stepId: string
  result: Promise<AiSendResult | null>
  error: unknown | null
  tokens: string[]
  committed: CommittedTurn | null
  settled: boolean
  waiters: Set<() => void>
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const MODEL_CATALOG_TTL_MS = 6 * 60 * 60 * 1000
const MODEL_CATALOG_TIMEOUT_MS = 8_000
const OPENROUTER_FALLBACK_MODELS = [
  'openrouter/auto',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku',
  'google/gemini-2.0-flash',
]
const LIBRECHAT_MODELS_QUERY_OLD = 'XU=e=>Yi([`models`],()=>P_(),{initialData:eh,refetchOnWindowFocus:!1,refetchOnReconnect:!1,refetchOnMount:!1,staleTime:1/0,...e})'
const LIBRECHAT_MODELS_QUERY_NEW = 'XU=e=>Yi([`models`],()=>P_(),{placeholderData:eh,refetchOnWindowFocus:!0,refetchOnReconnect:!0,refetchOnMount:!0,staleTime:3e5,...e})'

const LOCAL_USER = {
  // LibreChat's persisted-user shape uses `_id` (the legacy `id` alias is
  // kept as well because a few client paths still read it).
  _id: 'kapanis-local-user',
  id: 'kapanis-local-user',
  username: 'kapanis',
  email: 'local@kapanis.invalid',
  name: 'kapanış.',
  avatar: '',
  role: 'USER',
  provider: 'local',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date().toISOString(),
}

const LOCAL_TOKEN = 'kapanis-local-session'

const PROVIDER_NAMES: Record<string, AiProviderId> = {
  openrouter: 'openrouter',
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  gemini: 'google',
  mistral: 'mistral',
  groq: 'groq',
  ollama: 'ollama',
  custom: 'custom',
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

/**
 * Small in-process compatibility surface for the official LibreChat client.
 * It deliberately owns no database: conversations and provider calls are
 * delegated to AiStore, which keeps the only durable state in SQLite.
 */
export class LibreChatServer {
  private readonly root: string
  private readonly ai: AiStore
  private server: Server | null = null
  private address: string | null = null
  private readonly generations = new Map<string, PendingGeneration>()
  private modelCatalogRefresh: Promise<string[]> | null = null

  constructor(root: string, ai: AiStore) {
    this.root = path.resolve(root)
    this.ai = ai
  }

  async start() {
    if (this.server && this.address) return this.address
    await access(path.join(this.root, 'index.html'))
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        console.error('[librechat] request failed', error)
        if (!response.headersSent) this.json(response, 500, { message: 'LibreChat yerel isteği başarısız.' })
        else response.end()
      })
    })
    await new Promise<void>((resolve, reject) => {
      const server = this.server as Server
      const onError = (error: Error) => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, '127.0.0.1')
    })
    const port = (this.server.address() as { port: number }).port
    this.address = `http://127.0.0.1:${port}`
    // Warm the catalog without delaying the first window paint. The same
    // promise is reused if LibreChat asks for models while the refresh runs.
    void this.getOpenRouterModels().catch((error) => console.warn('[librechat] OpenRouter model kataloğu yenilenemedi', error))
    return this.address
  }

  async stop() {
    const server = this.server
    this.server = null
    this.address = null
    this.generations.clear()
    this.modelCatalogRefresh = null
    if (!server) return
    // BrowserView/fetch keeps an HTTP keep-alive socket around even after the
    // page is detached. Destroy those sockets before waiting for `close`, so
    // quitting the desktop app never waits on a renderer connection forever.
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  getUrl() {
    return this.address ?? ''
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-LibreChat-Generation-Protocol')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const parsed = new URL(request.url ?? '/', this.address ?? 'http://127.0.0.1')
    const pathname = parsed.pathname

    if (pathname === '/health' || pathname === '/api/health') {
      this.text(response, 200, 'OK')
      return
    }
    if (pathname === '/api/auth/refresh') {
      this.json(response, 200, { token: LOCAL_TOKEN, user: LOCAL_USER })
      return
    }
    if (pathname === '/api/auth/logout') {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/user') {
      this.json(response, 200, LOCAL_USER)
      return
    }
    if (pathname === '/api/user/terms') {
      this.json(response, 200, { termsAccepted: true })
      return
    }
    if (pathname === '/api/search/enable') {
      this.json(response, 200, false)
      return
    }
    // The bundled client polls this endpoint for the optional public banner.
    // There is no remote announcement service in the embedded, local-first
    // build, so an explicit null response keeps the banner slot collapsed
    // instead of letting the SPA fallback render a blank strip with a close
    // button at the top of the chat surface.
    if (pathname === '/api/banner') {
      this.json(response, 200, null)
      return
    }
    if (pathname === '/api/balance') {
      this.json(response, 200, { enabled: false })
      return
    }
    if (pathname === '/api/config') {
      this.json(response, 200, startupConfig(this.ai.getSnapshot()))
      return
    }
    if (pathname === '/api/endpoints') {
      this.json(response, 200, endpointsConfig())
      return
    }
    if (pathname === '/api/endpoints/token-config') {
      this.json(response, 200, {})
      return
    }
    if (pathname === '/api/keys' && request.method === 'GET') {
      const name = parsed.searchParams.get('name') ?? ''
      const providerId = resolveProvider(name)
      const provider = this.ai.getSnapshot().providers.find((item) => item.id === providerId)
      this.json(response, 200, { expiresAt: provider?.apiKeySet ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : '' })
      return
    }
    if (pathname === '/api/keys' && request.method === 'PUT') {
      const body = await readBody(request)
      const providerId = resolveProvider(String(body.name ?? body.endpoint ?? body.spec ?? ''))
      const value = typeof body.value === 'string' ? body.value.trim() : ''
      if (value) this.ai.setProvider({ id: providerId, apiKey: value })
      this.json(response, 200, { expiresAt: value ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : '' })
      return
    }
    if (pathname.startsWith('/api/keys/') && request.method === 'DELETE') {
      const providerId = resolveProvider(decodeURIComponent(pathname.slice('/api/keys/'.length)))
      this.ai.setProvider({ id: providerId, clearApiKey: true })
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/keys' && request.method === 'DELETE') {
      for (const provider of this.ai.getSnapshot().providers) this.ai.setProvider({ id: provider.id, clearApiKey: true })
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/api-keys') {
      this.json(response, request.method === 'GET' ? 200 : 201, request.method === 'GET' ? [] : { success: true })
      return
    }
    if (pathname === '/api/models') {
      response.setHeader('Cache-Control', 'no-store')
      this.json(response, 200, await this.modelsConfig())
      return
    }
    // These lightweight local responses keep LibreChat's restored navigation
    // panels usable without reintroducing a remote Mongo/Redis backend.  The
    // embedded build intentionally starts with empty collections; the chat,
    // model and conversation data still live in AiStore/SQLite below.
    if (pathname === '/api/presets' && request.method === 'GET') {
      this.json(response, 200, [])
      return
    }
    if (pathname === '/api/presets' && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      const body = await readBody(request)
      this.json(response, 200, { ...body, presetId: typeof body.presetId === 'string' ? body.presetId : randomUUID() })
      return
    }
    if (pathname === '/api/presets/delete') {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/prompts' && request.method === 'GET') {
      this.json(response, 200, [])
      return
    }
    if (pathname === '/api/prompts' && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      const body = await readBody(request)
      this.json(response, 200, { prompt: { ...body, _id: typeof body._id === 'string' ? body._id : randomUUID() }, group: null })
      return
    }
    if (pathname === '/api/prompts/random' || pathname === '/api/prompts/all') {
      this.json(response, 200, [])
      return
    }
    if (pathname === '/api/prompts/groups' && request.method === 'GET') {
      this.json(response, 200, { data: [], has_more: false, after: null })
      return
    }
    if (pathname === '/api/prompts/groups' && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      const body = await readBody(request)
      this.json(response, 200, { ...body, _id: typeof body._id === 'string' ? body._id : randomUUID() })
      return
    }
    if (pathname.startsWith('/api/prompts/groups/')) {
      this.json(response, 200, pathname.endsWith('/prompts') ? { data: [], has_more: false, after: null } : {})
      return
    }
    if (pathname === '/api/categories') {
      this.json(response, 200, [])
      return
    }
    if (pathname === '/api/memories' && request.method === 'GET') {
      this.json(response, 200, { memories: [], totalTokens: 0, tokenLimit: 10000, usagePercentage: 0 })
      return
    }
    if (pathname === '/api/memories' && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      const body = await readBody(request)
      this.json(response, 200, { ...body, success: true })
      return
    }
    if (pathname === '/api/memories/preferences' && (request.method === 'GET' || request.method === 'PATCH' || request.method === 'PUT')) {
      this.json(response, 200, { enabled: false })
      return
    }
    if (pathname.startsWith('/api/memories/') && (request.method === 'POST' || request.method === 'PATCH' || request.method === 'PUT' || request.method === 'DELETE')) {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/user/settings/favorites' && request.method === 'GET') {
      this.json(response, 200, [])
      return
    }
    if (pathname === '/api/user/settings/favorites' && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/user/settings/favorites/tools' && request.method === 'GET') {
      this.json(response, 200, [])
      return
    }
    if (pathname.startsWith('/api/user/settings/favorites/tools/')) {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/skills' && request.method === 'GET') {
      this.json(response, 200, { data: [], has_more: false, after: null })
      return
    }
    if (pathname === '/api/skills/states' && (request.method === 'GET' || request.method === 'POST' || request.method === 'PATCH')) {
      this.json(response, 200, { skillStates: {} })
      return
    }
    if (pathname.startsWith('/api/skills/')) {
      this.json(response, 200, pathname.endsWith('/tree') ? { nodes: [] } : {})
      return
    }
    if (pathname.startsWith('/api/roles/')) {
      this.json(response, 200, { name: decodeURIComponent(pathname.slice('/api/roles/'.length)), permissions: {} })
      return
    }
    if (pathname === '/api/roles') {
      this.json(response, 200, { roles: [] })
      return
    }
    if (pathname === '/api/agents' || pathname.startsWith('/api/agents?')) {
      this.json(response, 200, { object: 'list', data: [], has_more: false, after: null, first_id: '', last_id: '' })
      return
    }
    if (pathname === '/api/agents/chat/active') {
      this.json(response, 200, { activeJobIds: [] })
      return
    }
    if ((pathname === '/api/agents/chat/abort' || pathname === '/api/agents/chat/resume' || pathname === '/api/agents/chat/steer' || pathname === '/api/agents/chat/steer/cancel' || pathname === '/api/agents/chat/steer/arm') && request.method === 'POST') {
      this.json(response, 200, { status: 'settled', aborted: pathname.endsWith('/abort'), generationProtocolVersion: 2 })
      return
    }
    if (pathname.startsWith('/api/agents/chat/status/')) {
      const conversationId = decodeURIComponent(pathname.slice('/api/agents/chat/status/'.length))
      const pending = [...this.generations.values()].find((generation) => !generation.settled && generation.payload.conversationId === conversationId)
      this.json(response, 200, pending
        ? { active: true, status: 'running', streamId: [...this.generations.entries()].find(([, value]) => value === pending)?.[0] ?? null, createdAt: pending.startedAt, generationProtocolVersion: 2 }
        : { active: false, status: 'settled', conversationId, generationProtocolVersion: 2 })
      return
    }
    if (pathname.startsWith('/api/assistants/')) {
      this.json(response, 200, [])
      return
    }
    if (pathname === '/api/files' || pathname.startsWith('/api/files/')) {
      this.json(response, 200, pathname.endsWith('/config') ? { fileConfig: false } : [])
      return
    }
    if (pathname === '/api/mcp/servers' || pathname === '/api/mcp/tools') {
      this.json(response, 200, {})
      return
    }
    if (pathname === '/api/mcp/connection/status') {
      this.json(response, 200, {})
      return
    }
    // The official client asks for projects as soon as an authenticated
    // session is mounted.  Returning the expected paginated shape is
    // important even when the local adapter has no project store: an SPA
    // fallback (index.html) is not valid JSON and makes LibreChat render an
    // undefined project row, which then crashes while reading `project._id`.
    if (pathname === '/api/projects' && request.method === 'GET') {
      this.json(response, 200, { projects: [], nextCursor: null })
      return
    }
    if (pathname === '/api/projects' && request.method === 'POST') {
      const body = await readBody(request)
      const now = new Date().toISOString()
      this.json(response, 201, {
        _id: randomUUID(),
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Yeni Proje',
        description: typeof body.description === 'string' ? body.description : '',
        conversationCount: 0,
        createdAt: now,
        updatedAt: now,
        lastConversationAt: null,
      })
      return
    }
    if (pathname.startsWith('/api/projects/') && request.method === 'GET') {
      this.json(response, 404, { message: 'Proje bulunamadı.' })
      return
    }
    if (pathname.startsWith('/api/projects/') && (request.method === 'PATCH' || request.method === 'DELETE' || request.method === 'PUT')) {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/convos' && request.method === 'GET') {
      this.json(response, 200, { conversations: this.listConversations(parsed.searchParams), nextCursor: null })
      return
    }
    if (pathname === '/api/convos' && request.method === 'DELETE') {
      const body = await readBody(request)
      const nested = body.arg && typeof body.arg === 'object' && !Array.isArray(body.arg)
        ? body.arg as Record<string, unknown>
        : null
      const id = typeof body.arg === 'string'
        ? body.arg
        : typeof body.conversationId === 'string'
          ? body.conversationId
          : typeof body.conversation_id === 'string'
            ? body.conversation_id
            : typeof nested?.conversationId === 'string'
              ? nested.conversationId
              : ''
      if (id) this.ai.deleteConversation(id)
      this.json(response, 200, { success: true })
      return
    }
    if (pathname === '/api/convos/archive/all' && request.method === 'POST') {
      this.ai.archiveAllConversations()
      this.json(response, 200, { success: true })
      return
    }
    if ((pathname === '/api/convos/update' || pathname === '/api/convos/pin' || pathname === '/api/convos/archive') && request.method === 'POST') {
      const body = await readBody(request)
      const input = body.arg && typeof body.arg === 'object' && !Array.isArray(body.arg)
        ? body.arg as Record<string, unknown>
        : body
      const id = typeof input.conversationId === 'string' ? input.conversationId : ''
      const updated = id ? this.ai.updateConversation(id, {
        ...(pathname === '/api/convos/update' && typeof input.title === 'string' ? { title: input.title } : {}),
        ...(pathname === '/api/convos/pin' ? { pinned: input.pinned === true } : {}),
        ...(pathname === '/api/convos/archive' ? { isArchived: input.isArchived === true } : {}),
      }) : null
      if (!updated) {
        this.json(response, 404, { message: 'Sohbet bulunamadı.' })
        return
      }
      this.json(response, 200, this.toConversation(updated))
      return
    }
    if (/^\/api\/messages\/[^/]+\/[^/]+\/feedback$/.test(pathname)) {
      this.json(response, 200, { success: true })
      return
    }
    if (pathname.startsWith('/api/convos/')) {
      const conversationId = decodeURIComponent(pathname.slice('/api/convos/'.length))
      const conversation = this.ai.getSnapshot().conversations.find((item) => item.id === conversationId)
      if (!conversation) {
        this.json(response, 404, { message: 'Sohbet bulunamadı.' })
        return
      }
      this.json(response, 200, this.toConversation(conversation, true))
      return
    }
    if (pathname.startsWith('/api/messages/')) {
      const conversationId = decodeURIComponent(pathname.slice('/api/messages/'.length))
      const messages = this.ai.listMessages(conversationId)
      const conversation = this.ai.getSnapshot().conversations.find((item) => item.id === conversationId)
      const endpoint = conversation ? toLibreEndpoint(conversation.providerId) : 'custom'
      this.json(response, 200, messages.map((message, index) => this.toMessage(message, conversationId, index > 0 ? messages[index - 1]?.id ?? null : null, endpoint)))
      return
    }
    if (pathname === '/api/agents/chat/stream' || pathname.startsWith('/api/agents/chat/stream/')) {
      await this.streamGeneration(request, response, pathname)
      return
    }
    if ((request.method === 'POST' || request.method === 'PUT') && /^\/api\/agents\/chat\/[^/]+(?:\/modify)?$/.test(pathname)) {
      await this.startGeneration(request, response)
      return
    }
    if ((request.method === 'POST' || request.method === 'PUT') && /^\/api\/[^/]+\/chat(?:\/modify)?$/.test(pathname)) {
      await this.startGeneration(request, response)
      return
    }

    await this.serveStatic(pathname, response)
  }

  private async startGeneration(request: IncomingMessage, response: ServerResponse) {
    const payload = await readBody(request)
    const streamId = randomUUID()
    const startedAt = Date.now()
    const generation: PendingGeneration = {
      payload,
      startedAt,
      runId: randomUUID(),
      stepId: randomUUID(),
      result: Promise.resolve(null),
      error: null,
      tokens: [],
      committed: null,
      settled: false,
      waiters: new Set(),
    }
    generation.result = this.sendToLocalStore(payload, {
      onUserCommitted: (turn) => {
        generation.committed = turn
        generation.payload.conversationId = turn.conversation.id
        wakeGeneration(generation)
      },
      onToken: (token) => {
        if (!token) return
        generation.tokens.push(token)
        wakeGeneration(generation)
      },
    }).catch((error: unknown) => {
      // Provider failures can happen before the client opens the SSE URL.
      // Store the failure immediately so Node never sees an unhandled
      // rejection; the subscriber still receives it as LibreChat's final
      // error message below.
      generation.error = error
      return null
    }).finally(() => {
      generation.settled = true
      wakeGeneration(generation)
    })
    this.generations.set(streamId, generation)
    // Keep a completed promise available for a reconnecting SSE subscriber,
    // then release it after a short grace period if the view navigates away.
    setTimeout(() => this.generations.delete(streamId), 5 * 60_000).unref?.()
    this.json(response, 200, {
      status: 'stream',
      streamId,
      generationCreatedAt: startedAt,
      generationProtocolVersion: 2,
      conversationId: typeof payload.conversationId === 'string' ? payload.conversationId : null,
    })
  }

  private async streamGeneration(_request: IncomingMessage, response: ServerResponse, pathname: string) {
    const streamId = decodeURIComponent(pathname.slice('/api/agents/chat/stream/'.length))
    const generation = this.generations.get(streamId)
    if (!generation) {
      this.json(response, 404, { message: 'Akış bulunamadı.' })
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    try {
      let tokenIndex = 0
      let createdSent = false
      while (!generation.settled || tokenIndex < generation.tokens.length) {
        if (!createdSent && generation.committed) {
          const { conversation, userMessage, responseMessageId } = generation.committed
          const endpoint = toLibreEndpoint(conversation.providerId)
          this.sse(response, {
            generationProtocolVersion: 2,
            created: true,
            message: this.toMessage({ ...userMessage, conversationId: conversation.id }, conversation.id, null, endpoint),
          })
          // The client uses this stable id to assemble every token delta and
          // the final SQLite-backed response into one assistant message.
          generation.payload.responseMessageId = responseMessageId
          // LibreChat's generation protocol v2 does not consume the legacy
          // `{ message: true, text }` frames below. It first registers a
          // message-creation run step, then associates each text delta with
          // that step. Without this pair the browser receives the SSE bytes
          // but leaves the assistant bubble empty until the final event.
          this.sse(response, {
            generationProtocolVersion: 2,
            event: 'on_run_step',
            data: {
              stepIndex: 0,
              id: generation.stepId,
              type: 'message_creation',
              index: 0,
              stepDetails: {
                type: 'message_creation',
                message_creation: { message_id: responseMessageId },
              },
              usage: null,
              runId: generation.runId,
            },
          })
          createdSent = true
        }
        while (tokenIndex < generation.tokens.length) {
          const token = generation.tokens[tokenIndex++]
          this.sse(response, {
            generationProtocolVersion: 2,
            event: 'on_message_delta',
            data: {
              id: generation.stepId,
              delta: { content: [{ type: 'text', text: token }] },
            },
          })
        }
        if (!generation.settled) await waitForGeneration(generation)
      }
      const result = await generation.result
      if (!result) throw generation.error ?? new Error('AI isteği başarısız.')
      const conversation = this.ai.getSnapshot().conversations.find((item) => item.id === result.conversationId)
      const endpoint = conversation ? toLibreEndpoint(conversation.providerId) : 'custom'
      const userMessage = this.toMessage({ ...result.userMessage, conversationId: result.conversationId }, result.conversationId, null, endpoint)
      const assistantMessage = this.toMessage({ ...result.assistantMessage, conversationId: result.conversationId }, result.conversationId, userMessage.messageId, endpoint)
      if (!createdSent) this.sse(response, { generationProtocolVersion: 2, created: true, message: userMessage })
      this.sse(response, {
        generationProtocolVersion: 2,
        final: true,
        conversation: conversation ? this.toConversation(conversation) : { conversationId: result.conversationId },
        requestMessage: userMessage,
        responseMessage: assistantMessage,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI isteği başarısız.'
      this.sse(response, {
        generationProtocolVersion: 2,
        final: true,
        conversation: { conversationId: generation.payload.conversationId ?? null },
        requestMessage: this.toMessage({
          id: String(generation.payload.overrideUserMessageId ?? randomUUID()),
          role: 'user',
          content: String(generation.payload.text ?? ''),
          createdAt: Date.now(),
        }, String(generation.payload.conversationId ?? ''), null, typeof generation.payload.endpoint === 'string' ? toLibreEndpoint(resolveProvider(generation.payload.endpoint)) : 'custom'),
        responseMessage: {
          messageId: generation.committed?.responseMessageId ?? randomUUID(),
          conversationId: generation.payload.conversationId ?? null,
          parentMessageId: generation.committed?.userMessage.id ?? generation.payload.overrideUserMessageId ?? null,
          text: message,
          sender: 'LibreChat',
          isCreatedByUser: false,
          error: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
    } finally {
      response.end()
      this.generations.delete(streamId)
    }
  }

  private sendToLocalStore(payload: Record<string, unknown>, observer?: AiSendObserver) {
    const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : undefined
    const spec = typeof payload.spec === 'string' ? payload.spec : ''
    const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : ''
    const providerId = resolveProvider(`${spec} ${endpoint}`, model)
    const normalizedModel = normalizeModel(providerId, model)
    const userApiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : typeof payload.userApiKey === 'string' ? payload.userApiKey.trim() : ''
    if (userApiKey || normalizedModel) this.ai.setProvider({
      id: providerId,
      ...(userApiKey ? { apiKey: userApiKey } : {}),
      ...(normalizedModel ? { model: normalizedModel } : {}),
    })
    return this.ai.sendMessage({
      conversationId: typeof payload.conversationId === 'string' ? payload.conversationId : null,
      providerId,
      model: normalizedModel,
      content: typeof payload.text === 'string' ? payload.text : '',
    }, observer)
  }

  private async modelsConfig() {
    const openRouterModels = await this.getOpenRouterModels()
    return buildModelsConfig(openRouterModels, this.ai.getSnapshot())
  }

  private getOpenRouterModels(): Promise<string[]> {
    const stored = this.ai.getModelCatalog('openrouter')
    if (stored && Date.now() - stored.updatedAt < MODEL_CATALOG_TTL_MS) return Promise.resolve(stored.models)
    if (this.modelCatalogRefresh) return this.modelCatalogRefresh

    this.modelCatalogRefresh = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), MODEL_CATALOG_TIMEOUT_MS)
      try {
        const response = await fetch(OPENROUTER_MODELS_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'HTTP-Referer': 'https://kapanis.app', 'X-Title': 'kapanis' },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json() as { data?: Array<{ id?: unknown }> }
        const models = uniqueStrings((payload.data ?? []).map((item) => item?.id))
        if (models.length === 0) throw new Error('OpenRouter boş model kataloğu döndürdü.')
        return this.ai.setModelCatalog('openrouter', models).models
      } catch (error) {
        if (stored?.models.length) return stored.models
        console.warn('[librechat] OpenRouter model kataloğu için yerel yedek kullanılıyor', error)
        return OPENROUTER_FALLBACK_MODELS
      } finally {
        clearTimeout(timer)
        this.modelCatalogRefresh = null
      }
    })()
    return this.modelCatalogRefresh
  }

  private listConversations(searchParams: URLSearchParams) {
    const search = (searchParams.get('search') ?? '').trim().toLowerCase()
    const pinnedOnly = searchParams.get('pinned') === 'true'
    const archivedOnly = searchParams.get('isArchived') === 'true' || searchParams.get('archived') === 'true'
    return this.ai.getSnapshot().conversations
      .filter((conversation) => !search || conversation.title.toLowerCase().includes(search))
      .filter((conversation) => archivedOnly ? conversation.isArchived : !conversation.isArchived)
      .filter((conversation) => !pinnedOnly || conversation.pinned)
      .map((conversation) => this.toConversation(conversation))
  }

  private toConversation(conversation: AiConversation, includeMessages = false) {
    const endpoint = toLibreEndpoint(conversation.providerId)
    return {
      conversationId: conversation.id,
      endpoint,
      endpointType: endpoint === 'openAI' ? 'openAI' : endpoint === 'anthropic' ? 'anthropic' : endpoint === 'google' ? 'google' : 'custom',
      title: conversation.title,
      model: conversation.model,
      user: LOCAL_USER.id,
      ...(includeMessages ? { messages: this.ai.listMessages(conversation.id).map((message, index, all) => this.toMessage(message, conversation.id, index > 0 ? all[index - 1]?.id ?? null : null, endpoint)) } : {}),
      createdAt: new Date(conversation.createdAt).toISOString(),
      updatedAt: new Date(conversation.updatedAt).toISOString(),
      isArchived: conversation.isArchived,
      pinned: conversation.pinned,
      spec: conversation.providerId,
    }
  }

  private toMessage(message: AiMessage & { conversationId?: string | null }, conversationId: string | null, parentMessageId: string | null = null, endpoint = 'custom') {
    const isUser = message.role === 'user'
    return {
      messageId: message.id,
      conversationId: conversationId || message.conversationId || null,
      parentMessageId,
      responseMessageId: null,
      endpoint,
      model: undefined,
      sender: isUser ? 'User' : 'LibreChat',
      text: message.content,
      isCreatedByUser: isUser,
      error: false,
      createdAt: new Date(message.createdAt).toISOString(),
      updatedAt: new Date(message.createdAt).toISOString(),
    }
  }

  private async serveStatic(pathname: string, response: ServerResponse) {
    const decoded = decodeURIComponent(pathname)
    const relative = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\/+/, '')
    const candidate = path.resolve(this.root, relative)
    if (!candidate.startsWith(this.root + path.sep) && candidate !== path.join(this.root, 'index.html')) {
      this.json(response, 403, { message: 'Geçersiz kaynak yolu.' })
      return
    }
    let file = candidate
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('directory')
    } catch {
      // The official client is an SPA. Unknown navigation paths should load
      // the same shell while missing hashed assets remain a genuine 404.
      if (path.extname(relative)) {
        this.json(response, 404, { message: 'Kaynak bulunamadı.' })
        return
      }
      file = path.join(this.root, 'index.html')
    }
    if (/^hooks\.[^.]+\.js$/.test(path.basename(file))) {
      const source = await readFile(file, 'utf8')
      const patched = source.replace(LIBRECHAT_MODELS_QUERY_OLD, LIBRECHAT_MODELS_QUERY_NEW)
      if (patched === source) console.warn('[librechat] Model sorgusu uyumluluk patch noktası bulunamadı.')
      response.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(patched)
      return
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(response)
  }

  private json(response: ServerResponse, status: number, body: unknown) {
    const data = JSON.stringify(body)
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(data)
  }

  private text(response: ServerResponse, status: number, body: string) {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(body)
  }

  private sse(response: ServerResponse, data: unknown) {
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}

function wakeGeneration(generation: PendingGeneration) {
  const waiters = [...generation.waiters]
  generation.waiters.clear()
  for (const resolve of waiters) resolve()
}

function waitForGeneration(generation: PendingGeneration) {
  return new Promise<void>((resolve) => generation.waiters.add(resolve))
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 4 * 1024 * 1024) throw new Error('İstek gövdesi çok büyük.')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function resolveProvider(spec: string, model?: string): AiProviderId {
  const candidate = `${spec} ${model ?? ''}`.toLowerCase()
  for (const [name, provider] of Object.entries(PROVIDER_NAMES)) {
    if (candidate.includes(name)) return provider
  }
  return 'openrouter'
}

function toLibreEndpoint(provider: AiProviderId) {
  return provider === 'openai' ? 'openAI' : provider
}

function normalizeModel(provider: AiProviderId, model?: string) {
  const value = model?.trim() || ''
  if (!value) return undefined
  // OpenRouter model ids are already provider-qualified (for example
  // `openrouter/auto` and `anthropic/claude-*`). Removing `openrouter/`
  // would turn OpenRouter's own native ids into invalid model names.
  if (provider === 'openrouter') return value
  const prefix = `${provider}/`
  return value.toLowerCase().startsWith(prefix) ? value.slice(prefix.length) : value
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const item = value.trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function endpointsConfig() {
  // Keep the endpoint ids aligned with LibreChat's own endpoint enum.  The
  // OpenAI id is intentionally `openAI` (capital A); the client treats
  // `openai` as a different, unknown endpoint and silently drops its models.
  const definitions = [
    ['openrouter', 'OpenRouter', 'custom', true],
    ['openAI', 'OpenAI', 'openAI', true],
    ['anthropic', 'Anthropic', 'anthropic', true],
    ['google', 'Google Gemini', 'google', true],
    ['mistral', 'Mistral', 'custom', true],
    ['groq', 'Groq', 'custom', true],
    ['ollama', 'Ollama (yerel)', 'custom', false],
    ['custom', 'Kapanış yerel AI', 'custom', false],
  ] as const
  return Object.fromEntries(definitions.map(([id, label, type, userProvide], order) => [id, {
    order,
    type,
    name: label,
    modelDisplayLabel: label,
    titleConvo: false,
    userProvide,
    availableTools: [],
  }]))
}

function buildModelsConfig(openRouterModels: string[], snapshot: AiSnapshot) {
  const configured = new Map(snapshot.providers.map((provider) => [provider.id, provider.model]))
  return {
    initial: [],
    openAI: uniqueStrings([configured.get('openai'), 'gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini']),
    openrouter: uniqueStrings([configured.get('openrouter'), ...openRouterModels]),
    anthropic: uniqueStrings([configured.get('anthropic'), 'claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest']),
    google: uniqueStrings([configured.get('google'), 'gemini-2.0-flash', 'gemini-1.5-flash']),
    mistral: uniqueStrings([configured.get('mistral'), 'mistral-small-latest', 'mistral-large-latest']),
    groq: uniqueStrings([configured.get('groq'), 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']),
    ollama: uniqueStrings([configured.get('ollama'), 'llama3.2', 'qwen2.5:7b']),
    custom: uniqueStrings([configured.get('custom'), 'local-model']),
  }
}

function startupConfig(snapshot: AiSnapshot) {
  const configured = new Map(snapshot.providers.map((provider) => [provider.id, provider.model]))
  const specs = [
    ['openrouter', 'OpenRouter', 'openrouter', configured.get('openrouter') || 'openai/gpt-4o-mini', true],
    ['openai', 'OpenAI', 'openAI', configured.get('openai') || 'gpt-4o-mini', false],
    ['anthropic', 'Anthropic', 'anthropic', configured.get('anthropic') || 'claude-3-5-haiku-latest', false],
    ['google', 'Google Gemini', 'google', configured.get('google') || 'gemini-2.0-flash', false],
    ['mistral', 'Mistral', 'mistral', configured.get('mistral') || 'mistral-small-latest', false],
    ['groq', 'Groq', 'groq', configured.get('groq') || 'llama-3.3-70b-versatile', false],
    ['ollama', 'Ollama (yerel)', 'ollama', configured.get('ollama') || 'llama3.2', false],
    ['local', 'Kapanış yerel AI', 'custom', configured.get('custom') || 'local-model', false],
  ].map(([name, label, endpoint, model, isDefault]) => ({
    name,
    label,
    default: isDefault,
    showInMenu: true,
    showOnLanding: true,
    showIconInMenu: true,
    showIconInHeader: true,
    preset: { endpoint, model },
    conversation_starters: [],
  }))
  return {
    version: '1.3.14',
    cache: true,
    appTitle: 'LibreChat',
    serverDomain: '127.0.0.1',
    emailLoginEnabled: false,
    registrationEnabled: false,
    passwordResetEnabled: false,
    emailEnabled: false,
    socialLoginEnabled: false,
    discordLoginEnabled: false,
    facebookLoginEnabled: false,
    githubLoginEnabled: false,
    googleLoginEnabled: false,
    openidLoginEnabled: false,
    appleLoginEnabled: false,
    samlLoginEnabled: false,
    openidLabel: '',
    openidImageUrl: '',
    openidAutoRedirect: false,
    samlLabel: '',
    samlImageUrl: '',
    sharedLinksEnabled: false,
    publicSharedLinksEnabled: false,
    allowAccountDeletion: false,
    helpAndFaqURL: '',
    interface: {
      modelSelect: true,
      parameters: true,
      multiConvo: true,
      bookmarks: true,
      memories: true,
      presets: true,
      prompts: { use: true, create: true, share: false, public: false },
      agents: { use: true, create: true, share: false, public: false },
      temporaryChat: true,
      autoSubmitFromUrl: true,
      runCode: true,
      webSearch: true,
      contextUsage: true,
      contextCost: false,
      fileSearch: true,
      fileCitations: true,
      feedback: true,
      peoplePicker: { users: true, groups: true, roles: true },
      marketplace: { use: false },
      mcpServers: { use: true, create: true, share: false, public: false },
      buildInfo: true,
      remoteAgents: { use: false, create: false, share: false, public: false },
      skills: { use: true, create: true, share: false, public: false, defaultActiveOnShare: false },
      sharedLinks: { create: false, share: false, public: false, snapshotFiles: false },
      termsOfService: { modalAcceptance: false },
    },
    modelSpecs: { enforce: false, prioritize: true, list: specs },
    titleGenerationTiming: 'final',
    balance: { enabled: false },
    mcpServers: {},
  }
}
