import { useEffect, useMemo, useRef, useState } from 'react'
import Calendar from 'lucide-react/dist/esm/icons/calendar.js'
import FilePlus from 'lucide-react/dist/esm/icons/file-plus.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import Link2 from 'lucide-react/dist/esm/icons/link-2.js'
import ListTree from 'lucide-react/dist/esm/icons/list-tree.js'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.js'
import Minimize2 from 'lucide-react/dist/esm/icons/minimize-2.js'
import Network from 'lucide-react/dist/esm/icons/network.js'
import PanelLeft from 'lucide-react/dist/esm/icons/panel-left.js'
import PanelLeftClose from 'lucide-react/dist/esm/icons/panel-left-close.js'
import PanelRightClose from 'lucide-react/dist/esm/icons/panel-right-close.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Tag from 'lucide-react/dist/esm/icons/tag.js'
import { desktop } from '@/lib/desktop'
import { BacklinksPanel } from './backlinks/BacklinksPanel'
import { CommandPaletteModal } from './commands/CommandPaletteModal'
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from './editor/CodeMirrorEditor'
import { EditorToolbar } from './editor/EditorToolbar'
import {
  EMPTY_RICH_TEXT_FORMAT_STATE,
  type RichTextFormatState,
} from './editor/RichTextEditor'
import { FileExplorer } from './explorer/FileExplorer'
import { GraphView } from './graph/GraphView'
import { OutlinePanel } from './outline/OutlinePanel'
import { QuickSwitcherModal } from './search/QuickSwitcherModal'
import { VaultSearchPanel } from './search/VaultSearchPanel'
import { tabStore, useTabs } from './stores/tabStore'
import { useVault, vaultStore } from './stores/vaultStore'
import { TabBar } from './tabs/TabBar'
import { TagsPanel } from './tags/TagsPanel'
import type { EditorMode, NoteCommand } from './types'

type LeftNavTab = 'explorer' | 'search' | 'tags'
type RightNavTab = 'backlinks' | 'outline' | 'localGraph'

function getLocalDateKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function NotesPage() {
  const { vaultPath, entries, index } = useVault()
  const { tabs, activeTabId } = useTabs()
  const activeTab = tabs.find((t) => t.id === activeTabId) || null
  const activeNoteMetadata = activeTab && activeTab.viewType !== 'graph'
    ? index.files.get(activeTab.path) || null
    : null
  const activeNoteTitle = activeNoteMetadata?.title || activeTab?.title || 'Yeni Not'
  const activeNoteDirectory = activeTab?.path.includes('/')
    ? activeTab.path.slice(0, activeTab.path.lastIndexOf('/'))
    : 'Vault kökü'

  // Layout toggles
  const [leftNav, setLeftNav] = useState<LeftNavTab>('explorer')
  const [rightNav, setRightNav] = useState<RightNavTab>('backlinks')
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)

  // Editor states
  const [editorMode, setEditorMode] = useState<EditorMode>('live')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [stats, setStats] = useState({ wordCount: 0, charCount: 0 })
  const [formatState, setFormatState] = useState<RichTextFormatState>(EMPTY_RICH_TEXT_FORMAT_STATE)
  const editorRef = useRef<CodeMirrorEditorHandle | null>(null)

  useEffect(() => {
    setFormatState(EMPTY_RICH_TEXT_FORMAT_STATE)
  }, [activeTabId, editorMode])

  // Modals
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // 1. Initialize Vault on mount
  useEffect(() => {
    void vaultStore.init().then(() => {
      // If there are files and no tab is open, open the first note or Hoşgeldiniz
      const state = vaultStore.getState()
      const mdFiles = state.entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))
      if (mdFiles.length > 0 && tabStore.getState().tabs.length === 0) {
        const welcome = mdFiles.find((f) => f.name.toLowerCase().includes('hoşgeldin')) || mdFiles[0]
        tabStore.openTab(welcome.path)
      }
    })

    // Listen to filesystem events emitted by the Electron main-process watcher
    const unlistenFs = desktop.vault.onFsChange(() => {
      void vaultStore.reload()
    })

    return () => {
      unlistenFs()
      void desktop.vault.stopWatcher()
    }
  }, [])

  // 2. Create Note Helper
  function handleCreateNewNote() {
    const name = `Not ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '-')}.md`
    void (async () => {
      await vaultStore.createNote(name)
      tabStore.openTab(name)
    })()
  }

  // 3. Daily Note helper
  function handleOpenDailyNote() {
    const today = getLocalDateKey()
    const dailyPath = `Günlük/${today}.md`

    const existing = entries.find((e) => e.path === dailyPath)
    if (existing) {
      tabStore.openTab(dailyPath)
    } else {
      const template = `---
tags:
  - gunluk
created: ${today}
---

# ${today} - Günlük Not

## Yapılacaklar
- [ ] 

## Notlar ve Düşünceler


`
      void (async () => {
        await vaultStore.createNote(dailyPath, template)
        tabStore.openTab(dailyPath)
      })()
    }
  }

  // 4. Central Command Registry for Command Palette and Shortcuts
  const commands: NoteCommand[] = useMemo(() => {
    return [
      {
        id: 'new-note',
        label: 'Yeni Not Oluştur',
        shortcut: 'Ctrl + N',
        category: 'Dosya',
        execute: handleCreateNewNote,
      },
      {
        id: 'daily-note',
        label: 'Bugünün Notunu Aç (Daily Note)',
        shortcut: 'Ctrl + D',
        category: 'Gezinti',
        execute: handleOpenDailyNote,
      },
      {
        id: 'quick-switcher',
        label: 'Hızlı Not Değiştirici',
        shortcut: 'Ctrl + O',
        category: 'Gezinti',
        execute: () => setQuickSwitcherOpen(true),
      },
      {
        id: 'search-vault',
        label: 'Tüm Notlarda Ara',
        shortcut: 'Ctrl + Shift + F',
        category: 'Gezinti',
        execute: () => {
          setLeftNav('search')
          setLeftSidebarOpen(true)
        },
      },
      {
        id: 'open-graph',
        label: 'İlişki Grafiğini Aç (Graph View)',
        shortcut: 'Ctrl + G',
        category: 'Görünüm',
        execute: () => tabStore.openTab('graph', 'graph'),
      },
      {
        id: 'mode-live',
        label: 'Canlı Önizleme Modu (Live Preview)',
        category: 'Düzenleme',
        execute: () => setEditorMode('live'),
      },
      {
        id: 'mode-source',
        label: 'Kaynak Kodu Modu (Source Mode)',
        category: 'Düzenleme',
        execute: () => setEditorMode('source'),
      },
      {
        id: 'mode-reading',
        label: 'Okuma Modu (Reading Mode)',
        category: 'Düzenleme',
        execute: () => setEditorMode('reading'),
      },
      {
        id: 'toggle-left-sidebar',
        label: 'Sol Paneli Gizle / Göster',
        category: 'Görünüm',
        execute: () => setLeftSidebarOpen((prev) => !prev),
      },
      {
        id: 'toggle-right-sidebar',
        label: 'Sağ Paneli Gizle / Göster',
        category: 'Görünüm',
        execute: () => setRightSidebarOpen((prev) => !prev),
      },
      {
        id: 'change-vault',
        label: 'Vault Klasörünü Değiştir...',
        category: 'Dosya',
        execute: () => void vaultStore.selectNewVault(),
      },
      {
        id: 'reveal-in-explorer',
        label: 'Geçerli Notu Windows Gezgini\'nde Göster',
        category: 'Dosya',
        execute: () => {
          if (activeTab) void vaultStore.revealInExplorer(activeTab.path)
        },
      },
      {
        id: 'close-active-tab',
        label: 'Aktif Sekmeyi Kapat',
        shortcut: 'Ctrl + W',
        category: 'Dosya',
        execute: () => {
          if (activeTab) tabStore.closeTab(activeTab.id)
        },
      },
      {
        id: 'close-all-tabs',
        label: 'Tüm Sekmeleri Kapat',
        category: 'Dosya',
        execute: () => tabStore.closeAllTabs(),
      },
    ]
  }, [activeTab, entries])

  // 5. Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + N: New Note
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault()
        handleCreateNewNote()
        return
      }

      // Ctrl + G: Graph View
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        tabStore.openTab('graph', 'graph')
        return
      }

      // Ctrl + O: Quick Switcher
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        setQuickSwitcherOpen(true)
        return
      }

      // Ctrl + P: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // Ctrl + D: Daily Note
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        handleOpenDailyNote()
        return
      }

      // Ctrl + W: Close Active Tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (activeTab) {
          tabStore.closeTab(activeTab.id)
        }
        return
      }

      // Ctrl + Shift + F: Search in Notes
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setLeftNav('search')
        setLeftSidebarOpen(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, entries])

  const totalNotesCount = useMemo(() => {
    return entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md')).length
  }, [entries])

  const focusMode = !leftSidebarOpen && !rightSidebarOpen

  function toggleFocusMode() {
    if (focusMode) {
      setLeftSidebarOpen(true)
      return
    }
    setLeftSidebarOpen(false)
    setRightSidebarOpen(false)
  }

  return (
    <div className="dashboard-wrapper notes-dashboard-wrapper">
      {/* 2-SECTION LAYOUT: LEFT NOTES WORKSPACE + RIGHT STICKY YOUTUBE MUSIC (EXACT HOMEPAGE PARITY) */}
      <div className="dashboard-main-layout notes-dashboard-main-layout">
        {/* LEFT / CENTER: NOTES WORKSPACE FROSTED GLASS CARD */}
        <div className="dashboard-widgets-area notes-dashboard-widgets-area">
          <div className="notes-workspace-glass-card">
            {/* Card Top Header & Tab Strip */}
            <div className="notes-card-top-bar" data-window-drag>
              {/* Keep global chrome compact. Detailed note navigation lives inside the left panel. */}
              <div className="notes-card-nav-group">
                <button
                  type="button"
                  className={`notes-nav-chip ${leftSidebarOpen ? 'notes-nav-chip--active' : ''}`}
                  onClick={() => setLeftSidebarOpen((prev) => !prev)}
                  title={leftSidebarOpen ? 'Not panelini gizle' : 'Not panelini aç'}
                  aria-pressed={leftSidebarOpen}
                >
                  <PanelLeft size={14} />
                  <span className="notes-nav-label">Not paneli</span>
                </button>
              </div>

              <div className="notes-card-divider" />

              {/* Note Tabs Strip */}
              <TabBar onNewNote={handleCreateNewNote} />

              {/* Inspector stays available without crowding this rail with editor modes. */}
              <div className="notes-card-controls-group">
                <button
                  type="button"
                  className={`notes-inspector-toggle-btn ${rightSidebarOpen ? 'notes-inspector-toggle-btn--active' : ''}`}
                  onClick={() => setRightSidebarOpen((prev) => !prev)}
                  title={rightSidebarOpen ? 'Sağ Paneli Gizle' : 'Bağlantılar & İçindekiler Panelini Aç'}
                  aria-pressed={rightSidebarOpen}
                >
                  <Link2 size={13} />
                  <span className="notes-nav-label">Bağlantılar</span>
                </button>
              </div>
            </div>

            {/* Card Workspace Body (Sidebars + Main Viewport) */}
            <div className="notes-card-body">
              {/* Left Drawer */}
              {leftSidebarOpen && (
                <aside className="notes-card-sidebar notes-card-sidebar--left">
                  <div className="sidebar-drawer-header notes-library-header">
                    <div className="notes-library-heading">
                      <span>Notlar</span>
                      <small>{totalNotesCount}</small>
                    </div>
                    <button
                      type="button"
                      className="sidebar-collapse-btn"
                      onClick={() => setLeftSidebarOpen(false)}
                      title="Paneli Kapat"
                    >
                      <PanelLeftClose size={13} />
                    </button>
                  </div>
                  <div className="notes-sidebar-switcher" role="tablist" aria-label="Not paneli bölümleri">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftNav === 'explorer'}
                      className={`notes-sidebar-tab ${leftNav === 'explorer' ? 'notes-sidebar-tab--active' : ''}`}
                      onClick={() => setLeftNav('explorer')}
                    >
                      <Folder size={14} />
                      <span>Dosyalar</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftNav === 'search'}
                      className={`notes-sidebar-tab ${leftNav === 'search' ? 'notes-sidebar-tab--active' : ''}`}
                      onClick={() => setLeftNav('search')}
                    >
                      <Search size={14} />
                      <span>Ara</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftNav === 'tags'}
                      className={`notes-sidebar-tab ${leftNav === 'tags' ? 'notes-sidebar-tab--active' : ''}`}
                      onClick={() => setLeftNav('tags')}
                    >
                      <Tag size={14} />
                      <span>Etiket</span>
                    </button>
                  </div>
                  <div className="sidebar-content-area">
                    {leftNav === 'explorer' && <FileExplorer />}
                    {leftNav === 'search' && <VaultSearchPanel />}
                    {leftNav === 'tags' && (
                      <TagsPanel
                        onSelectTag={() => {
                          setLeftNav('search')
                        }}
                      />
                    )}
                  </div>
                </aside>
              )}

              {/* Center Editor / Graph View / Empty State Viewport */}
              <section className="notes-card-center-viewport">
                {activeTab && activeTab.viewType !== 'graph' && (
                  <header className="notes-editor-context-bar">
                    <div className="notes-editor-context-copy">
                      <div className="notes-editor-context-title-row">
                        <h1 className="notes-editor-context-title" title={activeTab.path}>
                          {activeNoteTitle}
                        </h1>
                        {activeTab.isDirty && <span className="notes-editor-dirty-mark" title="Kaydedilmemiş değişiklikler" />}
                      </div>
                      <div className="notes-editor-context-meta">
                        <span className="notes-editor-context-path" title={activeTab.path}>
                          {activeNoteDirectory}
                        </span>
                        {activeNoteMetadata?.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="notes-editor-context-tag">#{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="notes-editor-context-actions">
                      <button
                        type="button"
                        className={`notes-editor-context-action ${focusMode ? 'notes-editor-context-action--active' : ''}`}
                        onClick={toggleFocusMode}
                        title={focusMode ? 'Panelleri geri aç' : 'Odak moduna geç'}
                        aria-pressed={focusMode}
                      >
                        {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        <span>Odak</span>
                      </button>
                    </div>
                  </header>
                )}
                {activeTab && activeTab.viewType !== 'graph' && (
                  <EditorToolbar
                    mode={editorMode}
                    formatState={formatState}
                    onModeChange={setEditorMode}
                    onFormat={(command) => editorRef.current?.format(command)}
                    onUndo={() => editorRef.current?.undo()}
                    onRedo={() => editorRef.current?.redo()}
                    onSearch={() => editorRef.current?.search()}
                  />
                )}
                {activeTab ? (
                  activeTab.viewType === 'graph' ? (
                    <GraphView />
                  ) : vaultPath ? (
                    <CodeMirrorEditor
                      ref={editorRef}
                      key={activeTab.id}
                      tab={activeTab}
                      vaultPath={vaultPath}
                      mode={editorMode}
                      onSaveStatusChange={setSaveStatus}
                      onStatsChange={setStats}
                      onFormatStateChange={setFormatState}
                    />
                  ) : null
                ) : (
                  <div className="notes-empty-workspace">
                    <div className="notes-empty-card">
                      <FileText size={38} className="notes-empty-icon" />
                      <h3>Bir Not Seçin veya Oluşturun</h3>
                      <p>Sol menüden bir dosya seçebilir ya da aşağıdaki hızlı araçları kullanabilirsiniz.</p>

                      <div className="empty-quick-actions">
                        <button
                          type="button"
                          className="quick-action-btn"
                          onClick={handleCreateNewNote}
                        >
                          <FilePlus size={14} />
                          <span>Yeni Not (Ctrl + N)</span>
                        </button>
                        <button
                          type="button"
                          className="quick-action-btn"
                          onClick={() => setQuickSwitcherOpen(true)}
                        >
                          <Search size={14} />
                          <span>Hızlı Not Aç (Ctrl + O)</span>
                        </button>
                        <button
                          type="button"
                          className="quick-action-btn"
                          onClick={handleOpenDailyNote}
                        >
                          <Calendar size={14} />
                          <span>Bugünün Notu (Ctrl + D)</span>
                        </button>
                        <button
                          type="button"
                          className="quick-action-btn"
                          onClick={() => tabStore.openTab('graph', 'graph')}
                        >
                          <Network size={14} />
                          <span>İlişki Grafiği (Ctrl + G)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Right Inspector Drawer */}
              {rightSidebarOpen && (
                <aside className="notes-card-sidebar notes-card-sidebar--right">
                  <div className="sidebar-drawer-header">
                    <div className="sidebar-drawer-subtabs">
                      <button
                        type="button"
                        className={`drawer-subtab-btn ${rightNav === 'backlinks' ? 'drawer-subtab-btn--active' : ''}`}
                        onClick={() => setRightNav('backlinks')}
                        title="Geri Bağlantılar"
                      >
                        <Link2 size={13} />
                        <span>Bağlantılar</span>
                      </button>
                      <button
                        type="button"
                        className={`drawer-subtab-btn ${rightNav === 'outline' ? 'drawer-subtab-btn--active' : ''}`}
                        onClick={() => setRightNav('outline')}
                        title="İçindekiler"
                      >
                        <ListTree size={13} />
                        <span>İçindekiler</span>
                      </button>
                      <button
                        type="button"
                        className={`drawer-subtab-btn ${rightNav === 'localGraph' ? 'drawer-subtab-btn--active' : ''}`}
                        onClick={() => setRightNav('localGraph')}
                        title="Yerel Grafik"
                      >
                        <Network size={13} />
                        <span>Grafik</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className="sidebar-collapse-btn"
                      onClick={() => setRightSidebarOpen(false)}
                      title="Paneli Kapat"
                    >
                      <PanelRightClose size={13} />
                    </button>
                  </div>

                  <div className="sidebar-content-area">
                    {rightNav === 'backlinks' && (
                      <BacklinksPanel activePath={activeTab?.path || null} />
                    )}
                    {rightNav === 'outline' && (
                      <OutlinePanel activePath={activeTab?.path || null} />
                    )}
                    {rightNav === 'localGraph' && (
                      <GraphView isLocal localPath={activeTab?.path || undefined} />
                    )}
                  </div>
                </aside>
              )}
            </div>

            {/* Card Bottom Status Strip */}
            <footer className="notes-card-status-strip">
              <div className="status-bar-left">
                <span className="status-item">
                  <FileText size={11} className="mr-1 inline text-slate-400" />
                  {totalNotesCount} not
                </span>
                {activeTab && activeTab.viewType !== 'graph' && (
                  <>
                    <span className="status-dot">•</span>
                    <span className="status-item">
                      {stats.wordCount} kelime
                    </span>
                    <span className="status-dot">•</span>
                    <span className="status-item">
                      {stats.charCount} karakter
                    </span>
                  </>
                )}
              </div>

              <div className="status-bar-right">
                {activeTab && activeTab.viewType !== 'graph' && (
                  <span className="status-item status-save-indicator" aria-live="polite">
                    <span
                      className={`save-dot ${saveStatus === 'saving' ? 'save-dot--saving' : 'save-dot--saved'}`}
                    />
                    {saveStatus === 'saving' ? 'kaydediliyor...' : 'kaydedildi'}
                  </span>
                )}
                <span className="status-dot">•</span>
                <span
                  className="status-item status-vault-path"
                  title={vaultPath || ''}
                  onClick={() => void vaultStore.selectNewVault()}
                  style={{ cursor: 'pointer' }}
                >
                  {vaultPath ? vaultPath.split(/[/\\]/).pop() : 'Yerel Vault'}
                </span>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {/* Modals */}
      <QuickSwitcherModal
        isOpen={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
      />

      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  )
}
