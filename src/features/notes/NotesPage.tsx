import { useEffect, useMemo, useState } from 'react'
import BookOpen from 'lucide-react/dist/esm/icons/book-open.js'
import Calendar from 'lucide-react/dist/esm/icons/calendar.js'
import Code2 from 'lucide-react/dist/esm/icons/code-2.js'
import Eye from 'lucide-react/dist/esm/icons/eye.js'
import FilePlus from 'lucide-react/dist/esm/icons/file-plus.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import Link2 from 'lucide-react/dist/esm/icons/link-2.js'
import ListTree from 'lucide-react/dist/esm/icons/list-tree.js'
import Network from 'lucide-react/dist/esm/icons/network.js'
import PanelLeftClose from 'lucide-react/dist/esm/icons/panel-left-close.js'
import PanelRightClose from 'lucide-react/dist/esm/icons/panel-right-close.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import Tag from 'lucide-react/dist/esm/icons/tag.js'
import { desktop } from '@/lib/desktop'
import { BacklinksPanel } from './backlinks/BacklinksPanel'
import { CommandPaletteModal } from './commands/CommandPaletteModal'
import { CodeMirrorEditor } from './editor/CodeMirrorEditor'
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

export function NotesPage() {
  const { vaultPath, entries } = useVault()
  const { tabs, activeTabId } = useTabs()
  const activeTab = tabs.find((t) => t.id === activeTabId) || null

  // Layout toggles
  const [leftNav, setLeftNav] = useState<LeftNavTab>('explorer')
  const [rightNav, setRightNav] = useState<RightNavTab>('backlinks')
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)

  // Editor states
  const [editorMode, setEditorMode] = useState<EditorMode>('live')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [stats, setStats] = useState({ wordCount: 0, charCount: 0 })

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

    // Listen to filesystem events emitted by Rust watcher
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
    const today = new Date().toISOString().split('T')[0]
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

  return (
    <div className="dashboard-wrapper notes-dashboard-wrapper">
      {/* 2-SECTION LAYOUT: LEFT NOTES WORKSPACE + RIGHT STICKY YOUTUBE MUSIC (EXACT HOMEPAGE PARITY) */}
      <div className="dashboard-main-layout notes-dashboard-main-layout">
        {/* LEFT / CENTER: NOTES WORKSPACE FROSTED GLASS CARD */}
        <div className="dashboard-widgets-area notes-dashboard-widgets-area">
          <div className="notes-workspace-glass-card">
            {/* Card Top Header & Tab Strip */}
            <div className="notes-card-top-bar">
              {/* Left Sub-nav Chip Selector (Explorer, Search, Tags) */}
              <div className="notes-card-nav-group">
                <button
                  type="button"
                  className={`notes-nav-chip ${leftSidebarOpen && leftNav === 'explorer' ? 'notes-nav-chip--active' : ''}`}
                  onClick={() => {
                    if (leftSidebarOpen && leftNav === 'explorer') {
                      setLeftSidebarOpen(false)
                    } else {
                      setLeftNav('explorer')
                      setLeftSidebarOpen(true)
                    }
                  }}
                  title="Dosya Gezgini"
                >
                  <Folder size={13} />
                  <span>Dosyalar</span>
                  <span className="notes-count-badge">{totalNotesCount}</span>
                </button>

                <button
                  type="button"
                  className={`notes-nav-chip ${leftSidebarOpen && leftNav === 'search' ? 'notes-nav-chip--active' : ''}`}
                  onClick={() => {
                    if (leftSidebarOpen && leftNav === 'search') {
                      setLeftSidebarOpen(false)
                    } else {
                      setLeftNav('search')
                      setLeftSidebarOpen(true)
                    }
                  }}
                  title="Notlarda Ara"
                >
                  <Search size={13} />
                  <span>Ara</span>
                </button>

                <button
                  type="button"
                  className={`notes-nav-chip ${leftSidebarOpen && leftNav === 'tags' ? 'notes-nav-chip--active' : ''}`}
                  onClick={() => {
                    if (leftSidebarOpen && leftNav === 'tags') {
                      setLeftSidebarOpen(false)
                    } else {
                      setLeftNav('tags')
                      setLeftSidebarOpen(true)
                    }
                  }}
                  title="Etiketler"
                >
                  <Tag size={13} />
                  <span>Etiketler</span>
                </button>
              </div>

              <div className="notes-card-divider" />

              {/* Note Tabs Strip */}
              <TabBar onNewNote={handleCreateNewNote} />

              {/* Right View Modes & Inspector Toggle */}
              <div className="notes-card-controls-group">
                {activeTab && activeTab.viewType !== 'graph' && (
                  <div className="editor-mode-toggle-group">
                    <button
                      type="button"
                      className={`mode-toggle-btn ${editorMode === 'live' ? 'mode-toggle-btn--active' : ''}`}
                      onClick={() => setEditorMode('live')}
                      title="Canlı Önizleme"
                    >
                      <BookOpen size={12} />
                      <span>Canlı</span>
                    </button>
                    <button
                      type="button"
                      className={`mode-toggle-btn ${editorMode === 'source' ? 'mode-toggle-btn--active' : ''}`}
                      onClick={() => setEditorMode('source')}
                      title="Kaynak Kodu"
                    >
                      <Code2 size={12} />
                      <span>Kaynak</span>
                    </button>
                    <button
                      type="button"
                      className={`mode-toggle-btn ${editorMode === 'reading' ? 'mode-toggle-btn--active' : ''}`}
                      onClick={() => setEditorMode('reading')}
                      title="Okuma Modu"
                    >
                      <Eye size={12} />
                      <span>Okuma</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className={`notes-inspector-toggle-btn ${rightSidebarOpen ? 'notes-inspector-toggle-btn--active' : ''}`}
                  onClick={() => setRightSidebarOpen((prev) => !prev)}
                  title={rightSidebarOpen ? 'Sağ Paneli Gizle' : 'Bağlantılar & İçindekiler Panelini Aç'}
                >
                  <Link2 size={13} />
                  <span>Bağlantılar</span>
                </button>
              </div>
            </div>

            {/* Card Workspace Body (Sidebars + Main Viewport) */}
            <div className="notes-card-body">
              {/* Left Drawer */}
              {leftSidebarOpen && (
                <aside className="notes-card-sidebar notes-card-sidebar--left">
                  <div className="sidebar-drawer-header">
                    <span className="sidebar-drawer-title">
                      {leftNav === 'explorer' && 'Dosya Gezgini'}
                      {leftNav === 'search' && 'Notlarda Ara'}
                      {leftNav === 'tags' && 'Etiket Listesi'}
                    </span>
                    <button
                      type="button"
                      className="sidebar-collapse-btn"
                      onClick={() => setLeftSidebarOpen(false)}
                      title="Paneli Kapat"
                    >
                      <PanelLeftClose size={13} />
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
                {activeTab ? (
                  activeTab.viewType === 'graph' ? (
                    <GraphView />
                  ) : vaultPath ? (
                    <CodeMirrorEditor
                      key={activeTab.id}
                      tab={activeTab}
                      vaultPath={vaultPath}
                      mode={editorMode}
                      onSaveStatusChange={setSaveStatus}
                      onStatsChange={setStats}
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
                  <span className="status-item status-save-indicator">
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
