import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { AiStore } from './AiStore.js'
import type { LibreChatServer } from './LibreChatServer.js'
import type { LibreChatView } from './LibreChatView.js'
import type { AgentToolRuntime } from './OmniAgent.js'

export async function runLibreChatLifecycleSmoke(
  ai: AiStore,
  server: LibreChatServer,
  view: LibreChatView,
  window: BrowserWindow,
) {
  const conversationId = await assertSqliteStreaming(ai)
  await assertAgentToolLoop()

  const url = server.getUrl()
  const renamed = await postJson<{ title?: string }>(`${url}/api/convos/update`, { arg: { conversationId, title: 'Kalıcı sohbet' } })
  const pinned = await postJson<{ pinned?: boolean }>(`${url}/api/convos/pin`, { arg: { conversationId, pinned: true } })
  const archived = await postJson<{ isArchived?: boolean }>(`${url}/api/convos/archive`, { arg: { conversationId, isArchived: true } })
  if (renamed.title !== 'Kalıcı sohbet' || pinned.pinned !== true || archived.isArchived !== true) {
    throw new Error(`SQLite sohbet güncellemesi kalıcı değil: ${JSON.stringify({ renamed, pinned, archived })}`)
  }
  await postJson(`${url}/api/convos/archive`, { arg: { conversationId, isArchived: false } })
  const models = await fetchJson<{ openrouter?: string[]; 'openrouter-free'?: string[] }>(`${url}/api/models`)
  if (!Array.isArray(models.openrouter) || models.openrouter.length < 50) {
    throw new Error(`OpenRouter kataloğu eksik: ${models.openrouter?.length ?? 0}`)
  }
  if (models.openrouter[0] !== 'test/stream-model') {
    throw new Error(`SQLite model tercihi listenin başında değil: ${models.openrouter[0] ?? 'boş'}`)
  }
  if (!Array.isArray(models['openrouter-free']) || !models['openrouter-free'].includes('openrouter/free')) {
    throw new Error(`OpenRouter ücretsiz model grubu eksik: ${JSON.stringify(models['openrouter-free']?.slice(0, 6) ?? [])}`)
  }
  if (models.openrouter.includes('openrouter/free') || models.openrouter.some((model) => model.endsWith(':free'))) {
    throw new Error('Ücretsiz OpenRouter modelleri normal OpenRouter grubunda tekrar listeleniyor.')
  }

  const config = await fetchJson<{ modelSpecs?: { list?: Array<{ name?: string; label?: string; preset?: { model?: string } }> } }>(`${url}/api/config`)
  const openRouterSpec = config.modelSpecs?.list?.find((item) => item.name === 'openrouter')
  if (openRouterSpec?.preset?.model !== 'test/stream-model') {
    throw new Error(`SQLite model tercihi başlangıç yapılandırmasına yansımadı: ${openRouterSpec?.preset?.model ?? 'boş'}`)
  }
  const freeSpec = config.modelSpecs?.list?.find((item) => item.name === 'openrouter-free')
  if (freeSpec?.label !== 'OpenRouter · Ücretsiz') throw new Error('Ücretsiz OpenRouter model grubu başlangıç yapılandırmasında yok.')
  const freeConversation = ai.createConversation('openrouter', 'openrouter/free')
  const freeConversationPayload = await fetchJson<{ endpoint?: string; model?: string }>(`${url}/api/convos/${freeConversation.id}`)
  ai.deleteConversation(freeConversation.id)
  if (freeConversationPayload.endpoint !== 'openrouter-free' || freeConversationPayload.model !== 'openrouter/free') {
    throw new Error(`Ücretsiz model konuşması ayrı endpoint'i korumadı: ${JSON.stringify(freeConversationPayload)}`)
  }

  const indexHtml = await (await fetch(`${url}/`)).text()
  const hookPath = indexHtml.match(/href="\.\/(assets\/hooks\.[^"]+\.js)"/)?.[1]
  if (!hookPath) throw new Error('LibreChat model hook paketi bulunamadı.')
  const hookSource = await (await fetch(`${url}/${hookPath}`)).text()
  if (!hookSource.includes('placeholderData:eh') || hookSource.includes('initialData:eh,refetchOnWindowFocus:!1,refetchOnReconnect:!1,refetchOnMount:!1,staleTime:1/0')) {
    throw new Error('LibreChat model sorgusu canlı katalog için patchlenmedi.')
  }
  await assertDeferredProviderFailure(ai, url)

  const selectableModel = models.openrouter.find((model) => model.startsWith('openrouter/') && model !== 'test/stream-model')
  if (!selectableModel) throw new Error('Seçim testi için OpenRouter yerel modeli bulunamadı.')
  const providerProbe = await createProviderProbe()
  ai.setProvider({
    id: 'openrouter',
    baseUrl: providerProbe.baseUrl,
    model: 'test/stream-model',
    apiKey: 'smoke-key',
  })

  const bounds = { x: 72, y: 12, width: 940, height: 600 }
  await view.activate(url, bounds)
  const nativeView = window.getBrowserViews().find((candidate) => candidate.webContents.getURL().startsWith(url))
  if (!nativeView) throw new Error('LibreChat BrowserView pencereye bağlanmadı.')

  await waitUntilAsync(async () => {
    if (nativeView.webContents.isDestroyed() || nativeView.webContents.isLoading()) return false
    const state = await nativeView.webContents.executeJavaScript(`({
      ready: document.readyState,
      titlebarCount: document.querySelectorAll('[data-kapanis-titlebar="true"]').length,
      titlebarTop: document.querySelector('[data-kapanis-titlebar="true"]')?.getBoundingClientRect().top ?? -1,
      exportVisible: (() => {
        const element = document.querySelector('#export-menu-button');
        return element ? getComputedStyle(element).display !== 'none' : false;
      })(),
      modelRequestObserved: performance.getEntriesByType('resource').some((entry) => entry.name.includes('/api/models')),
      agentWidget: Boolean(document.querySelector('#omni-agent-center')),
      omniTheme: document.documentElement.dataset.omniTheme || '',
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    })`, true) as { ready: string; titlebarCount: number; titlebarTop: number; exportVisible: boolean; modelRequestObserved: boolean; agentWidget: boolean; omniTheme: string }
    return state.ready === 'complete'
      && state.titlebarCount > 0
      && state.titlebarTop === 0
      && !state.exportVisible
      && state.modelRequestObserved
      && state.agentWidget
      && Boolean(state.omniTheme)
      && (state as { bodyBackground?: string }).bodyBackground === 'rgba(0, 0, 0, 0)'
  }, 20_000, 'LibreChat başlık işaretlemesi veya canlı model sorgusu hazır olmadı.')

  const activityId = `smoke-tool-${Date.now()}`
  view.pushAgentActivity({ id: activityId, tool: 'app_theme', label: 'Tema', status: 'running', detail: 'Ocean uygulanıyor', createdAt: Date.now() })
  await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`(() => {
    const card=document.querySelector('#omni-tool-stream .omni-tool-card');
    return card?.getAttribute('data-status')==='running' && card.textContent?.includes('Ocean uygulanıyor');
  })()`, true)), 5_000, 'Tool çağrısı sohbet içi widget olarak görünmedi.')
  view.pushAgentActivity({ id: activityId, tool: 'app_theme', label: 'Tema', status: 'success', detail: 'Ocean uygulandı', createdAt: Date.now() })
  await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`(() => {
    const card=document.querySelector('#omni-tool-stream .omni-tool-card');
    return card?.getAttribute('data-status')==='success' && card.textContent?.includes('Tamamlandı');
  })()`, true)), 5_000, 'Tool widget tamamlanma durumuna geçmedi.')

  try {
    await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`!!document.querySelector('[data-testid="model-selector-button"]')`, true)), 15_000, 'Model seçici düğmesi oluşmadı.')
  } catch (error) {
    const diagnostics = await nativeView.webContents.executeJavaScript(`({
      url: location.href,
      title: document.title,
      text: document.body?.innerText.slice(0, 700) || '',
      buttons: [...document.querySelectorAll('button')].slice(0, 20).map((button) => ({ testid: button.dataset.testid, label: button.getAttribute('aria-label'), text: button.textContent?.trim() })),
    })`, true)
    throw new Error(`${error instanceof Error ? error.message : error}: ${JSON.stringify(diagnostics)}`)
  }
  await nativeView.webContents.executeJavaScript(`document.querySelector('[data-testid="model-selector-button"]')?.click()`, true)
  await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`!!document.querySelector('#model-search')`, true)), 5_000, 'Model seçici açılmadı.')
  await nativeView.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#model-search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!input || !setter) return false;
    setter.call(input, ${JSON.stringify(selectableModel)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`, true)
  await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`
    [...document.querySelectorAll('[role="option"], [role="menuitem"]')]
      .some((element) => element.textContent?.includes(${JSON.stringify(selectableModel)}))
  `, true)), 5_000, `OpenRouter modeli seçicide bulunamadı: ${selectableModel}`)
  const modelClicked = await nativeView.webContents.executeJavaScript(`(() => {
    const option = [...document.querySelectorAll('[role="option"], [role="menuitem"]')]
      .find((element) => element.textContent?.includes(${JSON.stringify(selectableModel)}));
    if (!(option instanceof HTMLElement)) return false;
    option.click();
    return true;
  })()`, true) as boolean
  if (!modelClicked) throw new Error(`OpenRouter modeli tıklanamadı: ${selectableModel}`)
  await nativeView.webContents.executeJavaScript(`(() => {
    const search = document.querySelector('#model-search');
    if (!(search instanceof HTMLElement)) return false;
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return true;
  })()`, true)
  await wait(150)
  await nativeView.webContents.executeJavaScript(`(() => {
    if (!document.querySelector('#model-search')) return false;
    const trigger = document.querySelector('[data-testid="model-selector-button"]');
    if (trigger instanceof HTMLElement) trigger.click();
    return true;
  })()`, true)
  try {
    await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`(() => {
      const search = document.querySelector('#model-search');
      if (!search) return true;
      const trigger = document.querySelector('[data-testid="model-selector-button"]');
      if (trigger?.getAttribute('aria-expanded') === 'false') return true;
      const style = getComputedStyle(search);
      return style.display === 'none' || style.visibility === 'hidden';
    })()`, true)), 5_000, 'Model seçimi kapanmadı.')
  } catch (error) {
    const diagnostics = await nativeView.webContents.executeJavaScript(`({
      searchOpen: Boolean(document.querySelector('#model-search')),
      searchValue: document.querySelector('#model-search')?.value || '',
      trigger: (() => {
        const element = document.querySelector('[data-testid="model-selector-button"]');
        return element instanceof HTMLElement ? { ariaExpanded: element.getAttribute('aria-expanded'), text: element.textContent?.trim(), html: element.outerHTML.slice(0, 900) } : null;
      })(),
      options: [...document.querySelectorAll('[role="option"], [role="menuitem"]')].slice(0, 12).map((element) => ({
        text: element.textContent?.trim().slice(0, 120),
        role: element.getAttribute('role'),
        disabled: element.getAttribute('aria-disabled'),
      })),
    })`, true)
    throw new Error(`${error instanceof Error ? error.message : error}: ${JSON.stringify(diagnostics)}`)
  }

  const prompt = `OpenRouter seçim testi ${Date.now()}`
  const promptEntered = await nativeView.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-testid="text-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!(input instanceof HTMLTextAreaElement) || !setter) return false;
    input.focus();
    setter.call(input, ${JSON.stringify(prompt)});
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(prompt)} }));
    return true;
  })()`, true) as boolean
  if (!promptEntered) throw new Error('LibreChat mesaj alanına seçim testi yazılamadı.')
  await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-testid="send-button"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  })()`, true)), 5_000, 'LibreChat gönder düğmesi seçim testinde etkinleşmedi.')
  await nativeView.webContents.executeJavaScript(`document.querySelector('[data-testid="send-button"]')?.click()`, true)
  await waitUntilAsync(async () => providerProbe.requests.some((request) => request.model === selectableModel), 10_000, `Seçilen model sağlayıcı isteğine ulaşmadı: ${selectableModel}`)
  await waitUntilAsync(async () => Boolean(await nativeView.webContents.executeJavaScript(`document.body?.innerText.includes('Seçilen model')`, true)), 10_000, 'İlk token LibreChat arayüzüne akmadı.')
  await waitUntilAsync(async () => ai.getSnapshot().conversations.some((conversation) =>
    conversation.model === selectableModel
      && ai.listMessages(conversation.id).some((message) => message.role === 'assistant' && message.content === 'Seçilen model çalıştı.'),
  ), 10_000, `Seçilen modelin canlı yanıtı SQLite'a yazılmadı: ${selectableModel}`)
  if (ai.getSnapshot().providers.find((provider) => provider.id === 'openrouter')?.model !== selectableModel) {
    throw new Error(`Seçilen model SQLite sağlayıcı ayarına yazılmadı: ${selectableModel}`)
  }

  const actualBounds = nativeView.getBounds()
  if (actualBounds.x < 50 || actualBounds.y > 24 || actualBounds.width < 800 || actualBounds.height < 500) {
    throw new Error(`LibreChat BrowserView üst başlık hizasından uzak veya çok küçük: ${JSON.stringify(actualBounds)}`)
  }
  view.deactivate()
  await providerProbe.close()
  if (window.getBrowserViews().some((candidate) => candidate === nativeView)) {
    throw new Error('LibreChat devre dışı bırakıldıktan sonra native görünüm bağlı kaldı.')
  }
  console.log(`[librechat-smoke] ${models.openrouter.length} OpenRouter modeli + ${models['openrouter-free'].length} ücretsiz model, ajan tool döngüsü/widgetı, SQLite canlı commit/stream ve hizalı pencere başlığı geçti`)
}

async function assertAgentToolLoop() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'omni-agent-smoke-'))
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const requests: Array<Record<string, unknown>> = []
  const streamedTokens: string[] = []
  const agent: AgentToolRuntime = {
    systemPrompt: 'Kullanıcı yalnızca “temayı değiştir” derse hangi tema olduğunu sor. Tema belirtilmişse app_theme aracını kullan.',
    tools: [{
      name: 'app_theme',
      description: 'Omni temasını değiştirir.',
      parameters: { type: 'object', properties: { theme: { type: 'string', enum: ['ocean'] } }, required: ['theme'] },
    }],
    async execute(name, args) {
      toolCalls.push({ name, args })
      return { ok: true, theme: args.theme }
    },
  }
  const provider = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    requests.push(body)
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    if (requests.length === 1) {
      response.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"theme-call","type":"function","function":{"name":"app_","arguments":"{\\"theme\\":"}}]}}]}\n\n')
      await wait(12)
      response.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"theme","arguments":"\\"ocean\\"}"}}]}}]}\n\n')
      response.end('data: [DONE]\n\n')
      return
    }
    response.write('data: {"choices":[{"delta":{"content":"Ocean teması "}}]}\n\n')
    await wait(12)
    response.write('data: {"choices":[{"delta":{"content":"uygulandı."}}]}\n\n')
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const port = (provider.address() as { port: number }).port
  const agentStore = new AiStore(dataDir, () => undefined, agent)
  try {
    agentStore.setProvider({ id: 'openrouter', baseUrl: `http://127.0.0.1:${port}`, model: 'agent-smoke-model', apiKey: 'agent-smoke-key' })
    const result = await agentStore.sendMessage({ providerId: 'openrouter', model: 'agent-smoke-model', content: 'Ocean temasına geç' }, {
      onToken: (token) => streamedTokens.push(token),
    })
    if (result.assistantMessage.content !== 'Ocean teması uygulandı.') throw new Error(`Ajan final yanıtı yanlış: ${result.assistantMessage.content}`)
    if (streamedTokens.join('') !== 'Ocean teması uygulandı.' || streamedTokens.length < 2) {
      throw new Error(`Ajan final yanıtı streaming gelmedi: ${JSON.stringify(streamedTokens)}`)
    }
    if (toolCalls.length !== 1 || toolCalls[0]?.name !== 'app_theme' || toolCalls[0]?.args.theme !== 'ocean') {
      throw new Error(`Ajan app_theme aracını beklenen argümanla çalıştırmadı: ${JSON.stringify(toolCalls)}`)
    }
    const first = requests[0] as { stream?: unknown; tools?: unknown[]; messages?: Array<{ role?: string; content?: string }> }
    if (first.stream !== true || !Array.isArray(first.tools) || !first.messages?.[0]?.content?.includes('hangi tema')) {
      throw new Error('Ajan araçları/system prompt sağlayıcı isteğine doğru eklenmedi.')
    }
    const second = requests[1] as { messages?: Array<{ role?: string; tool_call_id?: string }> }
    if (!second.messages?.some((message) => message.role === 'tool' && message.tool_call_id === 'theme-call')) {
      throw new Error('Ajan araç sonucu ikinci model turuna eklenmedi.')
    }
  } finally {
    agentStore.close()
    provider.closeAllConnections?.()
    await new Promise<void>((resolve) => provider.close(() => resolve()))
    rmSync(dataDir, { recursive: true, force: true })
  }
}

async function assertSqliteStreaming(ai: AiStore) {
  const fake = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { stream?: boolean; model?: string }
    if (request.url !== '/chat/completions' || body.stream !== true || body.model !== 'test/stream-model') {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Akış isteği beklenen biçimde değil.' } }))
      return
    }
    if (request.headers.authorization !== 'Bearer smoke-key') {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: `Authorization başlığı eksik: ${request.headers.authorization ?? 'yok'}` } }))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    response.write('data: {"choices":[{"delta":{"content":"Mer"}}]}\n\n')
    await wait(25)
    response.write('data: {"choices":[{"delta":{"content":"haba"}}]}\n\n')
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve))
  try {
    const port = (fake.address() as { port: number }).port
    ai.setProvider({
      id: 'openrouter',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'test/stream-model',
      apiKey: 'Bearer smoke-key',
    })
    const order: string[] = []
    const result = await ai.sendMessage({ providerId: 'openrouter', model: 'test/stream-model', content: 'Canlı akış testi' }, {
      onUserCommitted: () => order.push('commit'),
      onToken: (token) => order.push(token),
    })
    if (result.assistantMessage.content !== 'Merhaba' || order.join('|') !== 'commit|Mer|haba') {
      throw new Error(`SQLite/stream sırası yanlış: ${order.join('|')} / ${result.assistantMessage.content}`)
    }
    const messages = ai.listMessages(result.conversationId)
    if (messages.length !== 2 || messages[0]?.role !== 'user' || messages[1]?.content !== 'Merhaba') {
      throw new Error(`SQLite mesajları eksik: ${JSON.stringify(messages)}`)
    }
    return result.conversationId
  } finally {
    fake.closeAllConnections?.()
    await new Promise<void>((resolve) => fake.close(() => resolve()))
  }
}

async function createProviderProbe() {
  const requests: Array<{ model?: string; stream?: boolean }> = []
  const fake = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model?: string; stream?: boolean }
    requests.push(body)
    if (request.url !== '/chat/completions' || body.stream !== true) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Model seçimi isteği beklenen biçimde değil.' } }))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    response.write('data: {"choices":[{"delta":{"content":"Seçilen model "}}]}\n\n')
    await wait(400)
    response.write('data: {"choices":[{"delta":{"content":"çalıştı."}}]}\n\n')
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve))
  const port = (fake.address() as { port: number }).port
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: async () => {
      fake.closeAllConnections?.()
      await new Promise<void>((resolve) => fake.close(() => resolve()))
    },
  }
}

async function assertDeferredProviderFailure(ai: AiStore, url: string) {
  ai.setProvider({
    id: 'openrouter',
    baseUrl: 'http://127.0.0.1:1',
    model: 'test/fast-failure',
    apiKey: 'smoke-key',
  })
  const generation = await postJson<{ streamId?: string }>(`${url}/api/openrouter/chat`, {
    endpoint: 'openrouter',
    model: 'test/fast-failure',
    text: 'Hızlı hata testi',
    conversationId: null,
  })
  if (!generation.streamId) throw new Error('Hızlı sağlayıcı hatası için stream kimliği oluşmadı.')
  // Deliberately subscribe after the provider has already rejected. This is
  // the ordering that used to create a process-level unhandled rejection.
  await wait(75)
  const stream = await (await fetch(`${url}/api/agents/chat/stream/${generation.streamId}`)).text()
  if (!stream.includes('"final":true') || !stream.includes('"error":true')) {
    throw new Error(`Gecikmeli SSE sağlayıcı hatasını teslim etmedi: ${stream.slice(0, 400)}`)
  }
}

async function postJson<T = unknown>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return await response.json() as T
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return await response.json() as T
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function waitUntilAsync(check: () => Promise<boolean>, timeout: number, message: string) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await wait(50)
  }
  throw new Error(message)
}
