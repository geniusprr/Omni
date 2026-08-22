import { safeStorage } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type {
  AiConversation,
  AiMessage,
  AiProviderConfigInput,
  AiProviderId,
  AiProviderState,
  AiSendInput,
  AiSendResult,
  AiSnapshot,
} from '../shared/contracts.js'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 90_000

export interface AiModelCatalog {
  providerId: AiProviderId
  models: string[]
  updatedAt: number
}

export interface AiSendObserver {
  onUserCommitted?: (value: { conversation: AiConversation; userMessage: AiMessage; responseMessageId: string }) => void
  onToken?: (token: string) => void
}

interface ProviderDefinition {
  id: AiProviderId
  label: string
  kind: 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama'
  baseUrl: string
  defaultModel: string
  requiresApiKey: boolean
  placeholder: string
}

export const AI_PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    requiresApiKey: true,
    placeholder: 'sk-or-v1-…',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    placeholder: 'sk-…',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    requiresApiKey: true,
    placeholder: 'sk-ant-…',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    requiresApiKey: true,
    placeholder: 'AIza…',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    requiresApiKey: true,
    placeholder: 'Mistral API key',
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    placeholder: 'gsk_…',
  },
  {
    id: 'ollama',
    label: 'Ollama (yerel)',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'llama3.2',
    requiresApiKey: false,
    placeholder: 'API anahtarı gerekmez',
  },
  {
    id: 'custom',
    label: 'Özel OpenAI uyumlu',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: 'local-model',
    requiresApiKey: false,
    placeholder: 'İsteğe bağlı',
  },
]

const definitions = new Map(AI_PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition]))

function normalizeApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, '').trim()
}

export class AiStore {
  private readonly db: DatabaseSync
  private readonly emit: (snapshot: AiSnapshot) => void

  constructor(dataDir: string, emit: (snapshot: AiSnapshot) => void) {
    this.emit = emit
    const aiDir = path.join(dataDir, 'ai')
    mkdirSync(aiDir, { recursive: true })
    this.db = new DatabaseSync(path.join(aiDir, 'ai.sqlite'))
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        api_key TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        cached INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS response_cache (
        cache_key TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS response_cache_expiry_idx ON response_cache(expires_at);
      CREATE TABLE IF NOT EXISTS model_catalogs (
        provider_id TEXT PRIMARY KEY,
        models_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    try { this.db.exec('ALTER TABLE providers ADD COLUMN api_key TEXT') } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0') } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0') } catch { /* already migrated */ }
    this.seedProviders()
  }

  async ready() {
    return this.getSnapshot()
  }

  getSnapshot(): AiSnapshot {
    const providers = this.listProviders()
    const conversations = this.listConversations()
    const cacheRow = this.db.prepare('SELECT COUNT(*) AS count FROM response_cache WHERE expires_at > ?').get(Date.now()) as { count: number }
    return {
      providers,
      conversations,
      cacheEntries: Number(cacheRow?.count || 0),
    }
  }

  listMessages(conversationId: string): AiMessage[] {
    const rows = this.db.prepare(`
      SELECT id, role, content, created_at AS createdAt, cached
      FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
    `).all(conversationId) as Array<{ id: string; role: AiMessage['role']; content: string; createdAt: number; cached: number }>
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: Number(row.createdAt),
      cached: Boolean(row.cached),
    }))
  }

  getModelCatalog(providerId: AiProviderId): AiModelCatalog | null {
    const row = this.db.prepare(`
      SELECT models_json AS modelsJson, updated_at AS updatedAt
      FROM model_catalogs WHERE provider_id = ?
    `).get(providerId) as { modelsJson?: string; updatedAt?: number } | undefined
    if (!row?.modelsJson) return null
    try {
      const parsed = JSON.parse(row.modelsJson)
      if (!Array.isArray(parsed)) return null
      const models = uniqueModelIds(parsed)
      return models.length > 0
        ? { providerId, models, updatedAt: Number(row.updatedAt || 0) }
        : null
    } catch {
      return null
    }
  }

  setModelCatalog(providerId: AiProviderId, models: string[]): AiModelCatalog {
    this.getProvider(providerId)
    const normalized = uniqueModelIds(models)
    if (normalized.length === 0) throw new Error('Model kataloğu boş olamaz.')
    const updatedAt = Date.now()
    this.db.prepare(`
      INSERT INTO model_catalogs (provider_id, models_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET models_json=excluded.models_json, updated_at=excluded.updated_at
    `).run(providerId, JSON.stringify(normalized), updatedAt)
    return { providerId, models: normalized, updatedAt }
  }

  createConversation(providerId?: AiProviderId, model?: string): AiConversation {
    const provider = this.getProvider(providerId || 'openrouter')
    const now = Date.now()
    const id = randomUUID()
    const conversation: AiConversation = {
      id,
      title: 'Yeni sohbet',
      providerId: provider.id,
      model: model?.trim() || provider.defaultModel,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      pinned: false,
      isArchived: false,
    }
    this.db.prepare(`INSERT INTO conversations (id, title, provider_id, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(conversation.id, conversation.title, conversation.providerId, conversation.model, now, now)
    this.publish()
    return conversation
  }

  deleteConversation(id: string) {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    this.publish()
    return true
  }

  updateConversation(id: string, patch: { title?: string; pinned?: boolean; isArchived?: boolean }) {
    const existing = this.listConversations().find((conversation) => conversation.id === id)
    if (!existing) return null
    const title = patch.title?.trim() || existing.title
    const pinned = patch.pinned === undefined ? existing.pinned : patch.pinned
    const isArchived = patch.isArchived === undefined ? existing.isArchived : patch.isArchived
    this.db.prepare('UPDATE conversations SET title = ?, pinned = ?, archived = ?, updated_at = ? WHERE id = ?')
      .run(title, pinned ? 1 : 0, isArchived ? 1 : 0, Date.now(), id)
    this.publish()
    return this.listConversations().find((conversation) => conversation.id === id) ?? null
  }

  archiveAllConversations() {
    this.db.prepare('UPDATE conversations SET archived = 1, pinned = 0, updated_at = ? WHERE archived = 0').run(Date.now())
    this.publish()
    return true
  }

  clearCache() {
    this.db.prepare('DELETE FROM response_cache').run()
    this.publish()
    return true
  }

  setProvider(input: AiProviderConfigInput): AiSnapshot {
    const provider = this.getProvider(input.id)
    const existing = this.db.prepare('SELECT base_url AS baseUrl, model, api_key AS apiKey, enabled FROM providers WHERE id = ?').get(provider.id) as { baseUrl?: string; model?: string; apiKey?: string | null; enabled?: number } | undefined
    const baseUrl = input.baseUrl?.trim() || existing?.baseUrl || provider.baseUrl
    const model = input.model?.trim() || existing?.model || provider.defaultModel
    const enabled = input.enabled === undefined ? existing?.enabled ?? 1 : input.enabled ? 1 : 0
    const normalizedApiKey = input.apiKey ? normalizeApiKey(input.apiKey) : ''
    const apiKey = normalizedApiKey ? this.encrypt(normalizedApiKey) : input.clearApiKey ? null : existing?.apiKey || null
    this.db.prepare(`
      INSERT INTO providers (id, base_url, model, api_key, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url, model=excluded.model, api_key=excluded.api_key, enabled=excluded.enabled, updated_at=excluded.updated_at
    `).run(provider.id, baseUrl, model, apiKey, enabled, Date.now())
    this.publish()
    return this.getSnapshot()
  }

  async sendMessage(input: AiSendInput, observer: AiSendObserver = {}): Promise<AiSendResult> {
    const content = input.content.trim()
    if (!content) throw new Error('Mesaj boş olamaz.')
    const provider = this.getProvider(input.providerId)
    const storedProvider = this.db.prepare('SELECT base_url AS baseUrl, model, enabled FROM providers WHERE id = ?').get(provider.id) as { baseUrl?: string; model?: string; enabled?: number } | undefined
    const model = input.model?.trim() || storedProvider?.model || provider.defaultModel
    const apiKey = normalizeApiKey(this.getApiKey(provider.id))
    if (provider.requiresApiKey && !apiKey) throw new Error(`${provider.label} için API anahtarını AI ayarlarından ekleyin.`)

    const conversation = this.ensureConversation(input.conversationId, provider.id, model)
    const now = Date.now()
    const userMessage: AiMessage = { id: randomUUID(), role: 'user', content, createdAt: now }
    const responseMessageId = randomUUID()
    const title = conversation.title === 'Yeni sohbet' ? makeTitle(content) : conversation.title
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at, cached) VALUES (?, ?, ?, ?, ?, 0)')
        .run(userMessage.id, conversation.id, userMessage.role, userMessage.content, userMessage.createdAt)
      this.db.prepare('UPDATE conversations SET title = ?, provider_id = ?, model = ?, updated_at = ? WHERE id = ?')
        .run(title, provider.id, model, now, conversation.id)
      this.db.exec('COMMIT')
    } catch (error) {
      try { this.db.exec('ROLLBACK') } catch { /* best effort */ }
      throw error
    }
    // Publish as soon as SQLite commits the user turn. Provider requests can
    // take many seconds; the conversation list and every local subscriber
    // must still observe the durable write immediately.
    this.publish()
    observer.onUserCommitted?.({
      conversation: {
        ...conversation,
        title,
        providerId: provider.id,
        model,
        updatedAt: now,
        messageCount: (conversation.messageCount || 0) + 1,
      },
      userMessage,
      responseMessageId,
    })
    const history = this.listMessages(conversation.id).map(({ role, content: message }) => ({ role, content: message }))
    const cacheKey = createHash('sha256').update(JSON.stringify({ provider: provider.id, model, history })).digest('hex')
    const cached = this.db.prepare('SELECT response, expires_at AS expiresAt FROM response_cache WHERE cache_key = ?').get(cacheKey) as { response?: string; expiresAt?: number } | undefined
    let answer: string
    let fromCache = false
    let emittedToken = false
    const emitToken = observer.onToken
      ? (token: string) => {
          emittedToken = true
          observer.onToken?.(token)
        }
      : undefined
    if (cached?.response && Number(cached.expiresAt) > Date.now()) {
      answer = cached.response
      fromCache = true
      emitToken?.(answer)
    } else {
      answer = await requestProvider(provider, storedProvider?.baseUrl || provider.baseUrl, apiKey, model, history, emitToken)
      if (!emittedToken) emitToken?.(answer)
      this.db.prepare(`INSERT INTO response_cache (cache_key, provider_id, model, response, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET response=excluded.response, created_at=excluded.created_at, expires_at=excluded.expires_at`)
        .run(cacheKey, provider.id, model, answer, now, now + CACHE_TTL_MS)
    }
    const assistantMessage: AiMessage = { id: responseMessageId, role: 'assistant', content: answer, createdAt: Date.now(), cached: fromCache }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at, cached) VALUES (?, ?, ?, ?, ?, ?)')
        .run(assistantMessage.id, conversation.id, assistantMessage.role, assistantMessage.content, assistantMessage.createdAt, fromCache ? 1 : 0)
      this.db.prepare('UPDATE conversations SET title = ?, provider_id = ?, model = ?, updated_at = ? WHERE id = ?')
        .run(title, provider.id, model, assistantMessage.createdAt, conversation.id)
      this.db.exec('COMMIT')
    } catch (error) {
      try { this.db.exec('ROLLBACK') } catch { /* best effort */ }
      throw error
    }
    this.publish()
    return { conversationId: conversation.id, userMessage, assistantMessage, cached: fromCache }
  }

  close() {
    this.db.close()
  }

  private seedProviders() {
    const statement = this.db.prepare(`INSERT OR IGNORE INTO providers (id, base_url, model, api_key, enabled, updated_at) VALUES (?, ?, ?, NULL, 1, ?)`)
    for (const provider of AI_PROVIDER_DEFINITIONS) statement.run(provider.id, provider.baseUrl, provider.defaultModel, Date.now())
  }

  private listProviders(): AiProviderState[] {
    const rows = this.db.prepare('SELECT id, base_url AS baseUrl, model, enabled FROM providers ORDER BY rowid ASC').all() as Array<{ id: AiProviderId; baseUrl: string; model: string; enabled: number }>
    return rows.map((row) => {
      const definition = this.getProvider(row.id)
      return {
        id: row.id,
        label: definition.label,
        baseUrl: row.baseUrl,
        model: row.model,
        enabled: Boolean(row.enabled),
        requiresApiKey: definition.requiresApiKey,
        apiKeySet: Boolean(this.getApiKey(row.id)),
      }
    })
  }

  private listConversations(): AiConversation[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.title, c.provider_id AS providerId, c.model, c.created_at AS createdAt, c.updated_at AS updatedAt,
        c.pinned, c.archived AS isArchived,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messageCount
      FROM conversations c ORDER BY c.updated_at DESC
    `).all() as Array<Omit<AiConversation, 'providerId' | 'pinned' | 'isArchived'> & { providerId: AiProviderId; messageCount: number; pinned: number; isArchived: number }>
    return rows.map((row) => ({
      ...row,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
      messageCount: Number(row.messageCount),
      pinned: Boolean(row.pinned),
      isArchived: Boolean(row.isArchived),
    }))
  }

  private ensureConversation(id: string | null | undefined, providerId: AiProviderId, model: string) {
    if (id) {
      const existing = this.db.prepare('SELECT id, title, provider_id AS providerId, model, created_at AS createdAt, updated_at AS updatedAt, pinned, archived AS isArchived FROM conversations WHERE id = ?').get(id) as (Omit<AiConversation, 'pinned' | 'isArchived' | 'messageCount'> & { pinned: number; isArchived: number }) | undefined
      if (existing) return { ...existing, pinned: Boolean(existing.pinned), isArchived: Boolean(existing.isArchived), messageCount: this.listMessages(existing.id).length }
    }
    return this.createConversation(providerId, model)
  }

  private getProvider(id: AiProviderId): ProviderDefinition {
    const provider = definitions.get(id)
    if (!provider) throw new Error(`Bilinmeyen AI sağlayıcısı: ${id}`)
    return provider
  }

  private getApiKey(id: AiProviderId) {
    const row = this.db.prepare('SELECT api_key AS apiKey FROM providers WHERE id = ?').get(id) as { apiKey?: string | null } | undefined
    const value = row?.apiKey
    if (!value) return ''
    return this.decrypt(value)
  }

  private encrypt(value: string) {
    if (safeStorage.isEncryptionAvailable()) return `safe:${safeStorage.encryptString(value).toString('base64')}`
    return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
  }

  private decrypt(value: string) {
    try {
      if (value.startsWith('safe:') && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
      if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8')
    } catch {
      return ''
    }
    return ''
  }

  private publish() {
    this.emit(this.getSnapshot())
  }
}

function uniqueModelIds(values: unknown[]) {
  const seen = new Set<string>()
  const models: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const model = value.trim()
    if (!model || model.length > 256 || seen.has(model)) continue
    seen.add(model)
    models.push(model)
  }
  return models
}

async function requestProvider(
  provider: ProviderDefinition,
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: AiMessage['role']; content: string }>,
  onToken?: (token: string) => void,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    if (provider.kind === 'anthropic') {
      const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2048, ...(system ? { system } : {}), messages: messages.filter((message) => message.role !== 'system') }),
      })
      return readAnthropicResponse(await readJson(response))
    }
    if (provider.kind === 'gemini') {
      const url = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents: messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })) }),
      })
      return readGeminiResponse(await readJson(response))
    }
    if (provider.kind === 'ollama') {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false }),
      })
      const json = await readJson(response) as { message?: { content?: string } }
      if (typeof json.message?.content === 'string') return json.message.content.trim()
      throw new Error('Ollama boş yanıt döndürdü.')
    }
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`)
    if (provider.id === 'openrouter') {
      headers.set('HTTP-Referer', 'https://kapanis.app')
      headers.set('X-Title', 'kapanis')
    }
    const stream = typeof onToken === 'function'
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ model, messages, temperature: 0.7, stream }),
    })
    if (stream) {
      if (!response.ok) await readJson(response)
      return readOpenAiStream(response, onToken)
    }
    const json = await readJson(response) as { choices?: Array<{ message?: { content?: string } }> }
    const content = json.choices?.[0]?.message?.content
    if (typeof content === 'string' && content.trim()) return content.trim()
    throw new Error('AI sağlayıcısı boş yanıt döndürdü.')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('AI isteği zaman aşımına uğradı.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function readOpenAiStream(response: Response, onToken: (token: string) => void) {
  if (!response.body) throw new Error('AI sağlayıcısı akış gövdesi döndürmedi.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''

  const consumeLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string | Array<{ text?: string; content?: string }> } }>
      }
      const content = payload.choices?.[0]?.delta?.content
      const token = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text || part.content || '').join('')
          : ''
      if (!token) return
      answer += token
      onToken(token)
    } catch {
      // Providers may interleave comments and keep-alives with JSON frames.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = done ? '' : lines.pop() || ''
    for (const line of lines) consumeLine(line)
    if (done) break
  }
  if (buffer) consumeLine(buffer)
  if (!answer.trim()) throw new Error('AI sağlayıcısı boş bir akış döndürdü.')
  return answer
}

async function readJson(response: Response) {
  const text = await response.text()
  let json: any
  try { json = text ? JSON.parse(text) : {} } catch { json = {} }
  if (!response.ok) {
    const detail = json?.error?.message || json?.message || text || `HTTP ${response.status}`
    throw new Error(`AI sağlayıcısı: ${detail}`)
  }
  return json
}

function readAnthropicResponse(json: any) {
  const content = Array.isArray(json?.content) ? json.content.filter((item: any) => item?.type === 'text').map((item: any) => item.text).join('') : ''
  if (!content.trim()) throw new Error('Anthropic boş yanıt döndürdü.')
  return content.trim()
}

function readGeminiResponse(json: any) {
  const content = json?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || ''
  if (!content.trim()) throw new Error('Gemini boş yanıt döndürdü.')
  return content.trim()
}

function makeTitle(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact || 'Yeni sohbet'
}
