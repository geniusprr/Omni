import { dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { NoteItem, TransferItem } from '../src/types.js'
import { WindowManager } from './WindowManager.js'

const WELCOME_NOTE = [
  '---',
  'tags:',
  '  - baslangic',
  '  - rehber',
  'created: 2026-08-19',
  'status: active',
  '---',
  '',
  '# Omni Defter\'e Hoş Geldiniz',
  '',
  'Bu defter, **Obsidian** ve **Geode** mantığıyla çalışan, tamamen yerel dosya tabanlı bir kişisel bilgi ve not yönetim sistemidir.',
  '',
  '## Özellikler',
  '',
  '- **Markdown & Canlı Önizleme**: Zengin formatlar, tablolar, kod blokları ve görev listeleri.',
  '- **Çift Yönlü Bağlantılar (Wikilinks)**: [[Projeler]] veya [[Fikirler|Yaratıcı Düşünceler]] şeklinde notları birbirine bağlayın.',
  '- **İlişki Grafiği (Graph View)**: Notlar arasındaki bağlantıları görsel olarak keşfedin.',
  '- **Geri Bağlantılar (Backlinks)**: Sağ panelden bu nota referans veren diğer notları görün.',
  '- Hızlı Değiştirici: Ctrl + O ile notlar arasında geçiş yapın.',
  '- Komut Paleti: Ctrl + P ile tüm komutlara erişin.',
  '- Günlük Notlar: Ctrl + D ile bugünün notunu açın.',
  '',
  '### Görev Listesi',
  '- [x] Defter modülünü keşfet',
  '- [ ] İlk notumu oluştur',
  '- [ ] Bir [[wikilink]] ekle',
  '',
  'Keyifli çalışmalar!',
  '',
].join('\n')

export class ContentManager {
  private readonly dataDir: string
  private readonly notesPath: string
  private readonly transfersPath: string
  private readonly windows: WindowManager
  private watcher: fs.FSWatcher | null = null
  private watcherRoot: string | null = null
  private notes: NoteItem[] = []
  private transfers: TransferItem[] = []

  constructor(dataDir: string, windows: WindowManager) {
    this.dataDir = dataDir
    this.notesPath = path.join(dataDir, 'notes.json')
    this.transfersPath = path.join(dataDir, 'transfers.json')
    this.windows = windows
    this.notes = readJsonArray<NoteItem>(this.notesPath)
    this.transfers = readJsonArray<TransferItem>(this.transfersPath)
  }

  listNotes() { return this.notes.map((note) => ({ ...note })) }

  saveNote(content: string, id?: string, pinned?: boolean) {
    const now = Date.now()
    const existing = id ? this.notes.find((note) => note.id === id) : null
    const next: NoteItem = existing
      ? { ...existing, content, pinned: pinned ?? existing.pinned, updatedAt: now }
      : { id: randomUUID(), content, createdAt: now, updatedAt: now, pinned: pinned === true }
    this.notes = existing ? this.notes.map((note) => note.id === next.id ? next : note) : [next, ...this.notes]
    this.persistNotes()
    return { ...next }
  }

  deleteNote(id: string) {
    const before = this.notes.length
    this.notes = this.notes.filter((note) => note.id !== id)
    if (this.notes.length !== before) this.persistNotes()
    return this.notes.length !== before
  }

  toggleNotePin(id: string) {
    const note = this.notes.find((item) => item.id === id)
    if (!note) return false
    note.pinned = !note.pinned
    note.updatedAt = Date.now()
    this.persistNotes()
    return note.pinned
  }

  listTransfers() { return this.transfers.map((item) => ({ ...item })) }

  addTransfer(item: TransferItem) {
    this.transfers = [item, ...this.transfers.filter((current) => current.id !== item.id)].slice(0, 200)
    this.persistTransfers()
  }

  async openTransfer(filePath: string) {
    const error = await shell.openPath(filePath)
    if (error) throw new Error(error)
  }

  showTransfer(filePath: string) { shell.showItemInFolder(filePath) }

  deleteTransfer(id: string) {
    const before = this.transfers.length
    this.transfers = this.transfers.filter((item) => item.id !== id)
    if (before !== this.transfers.length) this.persistTransfers()
    return before !== this.transfers.length
  }

  clearTransfers() {
    this.transfers = []
    this.persistTransfers()
  }

  async selectVaultFolder() {
    const result = await dialog.showOpenDialog({
      title: 'Vault Klasörü Seç',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] || null
  }

  getDefaultVaultPath() {
    const vault = path.join(this.dataDir, 'vault')
    fs.mkdirSync(vault, { recursive: true })
    const welcome = path.join(vault, 'Hoşgeldiniz.md')
    if (!fs.existsSync(welcome)) fs.writeFileSync(welcome, WELCOME_NOTE, 'utf8')
    const projects = path.join(vault, 'Projeler')
    fs.mkdirSync(projects, { recursive: true })
    const project = path.join(projects, 'Omni.md')
    if (!fs.existsSync(project)) fs.writeFileSync(project, '# Omni Projesi\n\nSakin ve düşük kaynak tüketimli Windows kapatma, alarm ve defter uygulaması.\n\nİlgili not: [[Hoşgeldiniz]]', 'utf8')
    return vault
  }

  listVaultEntries(vaultPath: string) {
    const root = path.resolve(vaultPath)
    if (!fs.existsSync(root)) throw new Error('Vault dizini mevcut değil.')
    const entries: Array<{ path: string; name: string; isDir: boolean; modifiedAt: number; size: number }> = []
    const visit = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const absolute = path.join(current, entry.name)
        const isDir = entry.isDirectory()
        if (!isDir && !entry.name.toLowerCase().endsWith('.md')) continue
        const stat = safeStat(absolute)
        const relative = path.relative(root, absolute).replaceAll(path.sep, '/')
        entries.push({ path: relative, name: entry.name, isDir, modifiedAt: stat?.mtimeMs || 0, size: stat?.size || 0 })
        if (isDir) visit(absolute)
      }
    }
    visit(root)
    return entries
  }

  readVaultFile(vaultPath: string, relPath: string) {
    const target = this.safePath(vaultPath, relPath)
    if (!fs.existsSync(target)) throw new Error('Dosya bulunamadı.')
    return fs.readFileSync(target, 'utf8')
  }

  writeVaultFile(vaultPath: string, relPath: string, content: string) {
    const target = this.safePath(vaultPath, relPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }

  createVaultFile(vaultPath: string, relPath: string, initialContent?: string) {
    const clean = relPath.toLowerCase().endsWith('.md') ? relPath : relPath + '.md'
    const target = this.safePath(vaultPath, clean)
    if (fs.existsSync(target)) throw new Error('Bu isimde bir dosya zaten var.')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, initialContent || '', 'utf8')
  }

  createVaultFolder(vaultPath: string, relPath: string) {
    const target = this.safePath(vaultPath, relPath)
    if (fs.existsSync(target)) throw new Error('Bu isimde bir klasör zaten var.')
    fs.mkdirSync(target, { recursive: true })
  }

  renameVaultEntry(vaultPath: string, oldRelPath: string, newRelPath: string) {
    const oldTarget = this.safePath(vaultPath, oldRelPath)
    const newTarget = this.safePath(vaultPath, newRelPath)
    if (!fs.existsSync(oldTarget)) throw new Error('Taşınacak/adlandırılacak dosya bulunamadı.')
    if (fs.existsSync(newTarget)) throw new Error('Hedef isimde bir dosya veya klasör zaten var.')
    fs.mkdirSync(path.dirname(newTarget), { recursive: true })
    fs.renameSync(oldTarget, newTarget)
  }

  deleteVaultEntry(vaultPath: string, relPath: string) {
    const target = this.safePath(vaultPath, relPath)
    if (!fs.existsSync(target)) return
    fs.rmSync(target, { recursive: true, force: true })
  }

  revealVaultEntry(vaultPath: string, relPath?: string) {
    const target = relPath ? this.safePath(vaultPath, relPath) : path.resolve(vaultPath)
    shell.showItemInFolder(target)
  }

  startWatcher(vaultPath: string, emit: (payload: { kind: string; path: string }) => void) {
    this.stopWatcher()
    const root = path.resolve(vaultPath)
    if (!fs.existsSync(root)) throw new Error('İzlenecek klasör mevcut değil.')
    this.watcherRoot = root
    try {
      this.watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
        const relative = typeof filename === 'string' ? filename.replaceAll('\\', '/') : ''
        if (!relative || relative.split('/').some((part) => part.startsWith('.'))) return
        const kind = eventType === 'rename' ? (fs.existsSync(path.join(root, relative)) ? 'create' : 'remove') : 'modify'
        emit({ kind, path: relative })
      })
      this.watcher.on('error', (error) => console.error('[vault] watcher failed', error))
    } catch (error) {
      this.watcherRoot = null
      throw new Error('Dosya izleyici oluşturulamadı: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  stopWatcher() {
    this.watcher?.close()
    this.watcher = null
    this.watcherRoot = null
  }

  setWindowMode(mode: 'notes' | 'compact') { this.windows.setWindowMode(mode) }

  private safePath(vaultPath: string, relPath: string) {
    const root = path.resolve(vaultPath)
    const target = path.resolve(root, relPath.replace(/^[/\\]+/, ''))
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Güvenlik hatası: Vault dışındaki dosyalara erişilemez.')
    return target
  }

  private persistNotes() { writeJson(this.notesPath, this.notes) }
  private persistTransfers() { writeJson(this.transfersPath, this.transfers) }
}

function readJsonArray<T>(filePath: string): T[] {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    return Array.isArray(value) ? value as T[] : []
  } catch { return [] }
}

function writeJson(filePath: string, value: unknown) {
  try { fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8') } catch (error) { console.error('[content] state could not be persisted', error) }
}

function safeStat(filePath: string) {
  try { return fs.statSync(filePath) } catch { return null }
}
