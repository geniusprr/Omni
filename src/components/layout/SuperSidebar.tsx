import React, { useMemo, useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import BookOpen from 'lucide-react/dist/esm/icons/book-open.js'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import FilePlus from 'lucide-react/dist/esm/icons/file-plus.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import FolderPlus from 'lucide-react/dist/esm/icons/folder-plus.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import Radio from 'lucide-react/dist/esm/icons/radio.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import { tabStore } from '@/features/notes/stores/tabStore'
import { useVault, vaultStore } from '@/features/notes/stores/vaultStore'
import type { RemoteConnectionStatus } from '@/types'

export type AppMode = 'power' | 'alarms' | 'notes' | 'localsend' | 'remote' | 'settings'

interface SuperSidebarProps {
  activeMode: AppMode
  onSelectMode: (mode: AppMode) => void
  alarmsCount: number
  connectionStatus: RemoteConnectionStatus
  deviceName: string
  onOpenQuickSwitcher: () => void
}

interface FolderTreeItem {
  name: string
  path: string
  isDir: boolean
  children?: FolderTreeItem[]
}

export function SuperSidebar({
  activeMode,
  onSelectMode,
  alarmsCount,
  connectionStatus,
  deviceName,
  onOpenQuickSwitcher,
}: SuperSidebarProps) {
  const { entries } = useVault()
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})

  // Build folder hierarchy for the notes / projects tree
  const folderTree = useMemo(() => {
    const rootFolders: Record<string, { name: string; path: string; files: { name: string; path: string }[] }> = {}
    const rootFiles: { name: string; path: string }[] = []

    for (const entry of entries) {
      if (entry.isDir) continue
      const parts = entry.path.split('/')
      if (parts.length === 1) {
        rootFiles.push({ name: entry.name.replace(/\.md$/i, ''), path: entry.path })
      } else {
        const folderName = parts[0]
        if (!rootFolders[folderName]) {
          rootFolders[folderName] = {
            name: folderName,
            path: folderName,
            files: [],
          }
        }
        rootFolders[folderName].files.push({
          name: parts.slice(1).join('/').replace(/\.md$/i, ''),
          path: entry.path,
        })
      }
    }

    return { rootFolders: Object.values(rootFolders), rootFiles }
  }, [entries])

  function toggleFolder(folderPath: string, e: React.MouseEvent) {
    e.stopPropagation()
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }))
  }

  function handleOpenNote(notePath: string) {
    tabStore.openTab(notePath)
    onSelectMode('notes')
  }

  async function handleCreateNoteInFolder(folderPath?: string) {
    const defaultName = `Yeni Not ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}`
    const fullPath = folderPath ? `${folderPath}/${defaultName}.md` : `${defaultName}.md`
    await vaultStore.createNote(fullPath)
    tabStore.openTab(fullPath)
    onSelectMode('notes')
  }

  return (
    <aside className="super-sidebar" aria-label="Ana Gezinme">
      {/* Top Brand & Workspace Header */}
      <div className="super-sidebar__header">
        <div className="super-sidebar__workspace-selector">
          <div className="workspace-brand-badge">
            <span className="workspace-logo-dot" />
            <span className="workspace-title">Omni</span>
          </div>
          <ChevronDown size={14} className="workspace-chevron" />
        </div>

        <div className="super-sidebar__quick-tools">
          <button
            type="button"
            className="sidebar-tool-btn"
            onClick={onOpenQuickSwitcher}
            title="Hızlı Ara (Ctrl+K)"
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            className="sidebar-tool-btn"
            onClick={() => void handleCreateNoteInFolder()}
            title="Yeni Not Oluştur (Ctrl+N)"
          >
            <FilePlus size={14} />
          </button>
        </div>
      </div>

      {/* Main Navigation Modules */}
      <div className="super-sidebar__nav-section">
        <div className="super-sidebar__section-title">Modüller</div>
        <nav className="super-sidebar__nav-list">
          <button
            type="button"
            className={`sidebar-nav-item ${activeMode === 'power' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onSelectMode('power')}
          >
            <span className="nav-item-icon nav-item-icon--power">
              <Power size={15} />
            </span>
            <span className="nav-item-label">Güç Sayacı</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeMode === 'alarms' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onSelectMode('alarms')}
          >
            <span className="nav-item-icon nav-item-icon--alarm">
              <AlarmClock size={15} />
            </span>
            <span className="nav-item-label">Alarmlar</span>
            {alarmsCount > 0 && <span className="nav-item-badge">{alarmsCount}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeMode === 'notes' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onSelectMode('notes')}
          >
            <span className="nav-item-icon nav-item-icon--notes">
              <BookOpen size={15} />
            </span>
            <span className="nav-item-label">Defter & Notlar</span>
            {entries.length > 0 && (
              <span className="nav-item-count">{entries.filter((e) => !e.isDir).length}</span>
            )}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeMode === 'localsend' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onSelectMode('localsend')}
          >
            <span className="nav-item-icon nav-item-icon--share">
              <Share2 size={15} />
            </span>
            <span className="nav-item-label">LocalSend Paylaş</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeMode === 'remote' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onSelectMode('remote')}
          >
            <span className="nav-item-icon nav-item-icon--remote">
              <Smartphone size={15} />
            </span>
            <span className="nav-item-label">Uzaktan Kontrol</span>
            <span
              className={`nav-status-indicator ${connectionStatus === 'connected' ? 'nav-status-indicator--online' : ''}`}
            />
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeMode === 'settings' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onSelectMode('settings')}
          >
            <span className="nav-item-icon nav-item-icon--settings">
              <Settings size={15} />
            </span>
            <span className="nav-item-label">Ayarlar</span>
          </button>
        </nav>
      </div>

      {/* Projects & Notes Tree Section */}
      <div className="super-sidebar__projects-section">
        <div className="super-sidebar__section-header">
          <span className="super-sidebar__section-title">Projeler & Notlar</span>
          <button
            type="button"
            className="sidebar-add-btn"
            onClick={() => void handleCreateNoteInFolder()}
            title="Yeni Not Ekle"
          >
            <FilePlus size={13} />
          </button>
        </div>

        <div className="super-sidebar__tree-container">
          {folderTree.rootFolders.length === 0 && folderTree.rootFiles.length === 0 ? (
            <div className="sidebar-empty-tree">
              <p>Defter henüz boş.</p>
              <button
                type="button"
                className="sidebar-empty-action"
                onClick={() => void handleCreateNoteInFolder()}
              >
                + İlk Notunu Yaz
              </button>
            </div>
          ) : (
            <div className="sidebar-tree-list">
              {/* Folders */}
              {folderTree.rootFolders.map((folder) => {
                const isCollapsed = Boolean(collapsedFolders[folder.path])
                return (
                  <div key={folder.path} className="sidebar-folder-group">
                    <div
                      className="sidebar-folder-header"
                      onClick={(e) => toggleFolder(folder.path, e)}
                    >
                      <span className="folder-chevron">
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </span>
                      <Folder size={14} className="folder-icon" />
                      <span className="folder-name" title={folder.name}>
                        {folder.name}
                      </span>
                      <button
                        type="button"
                        className="folder-add-note-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleCreateNoteInFolder(folder.path)
                        }}
                        title={`${folder.name} içinde yeni not oluştur`}
                      >
                        <FilePlus size={11} />
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="sidebar-folder-children">
                        {folder.files.map((file) => (
                          <div
                            key={file.path}
                            className="sidebar-note-item"
                            onClick={() => handleOpenNote(file.path)}
                            title={file.name}
                          >
                            <span className="tree-line-indicator" />
                            <FileText size={13} className="note-item-icon" />
                            <span className="note-item-title">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Root Files */}
              {folderTree.rootFiles.map((file) => (
                <div
                  key={file.path}
                  className="sidebar-note-item sidebar-note-item--root"
                  onClick={() => handleOpenNote(file.path)}
                  title={file.name}
                >
                  <FileText size={13} className="note-item-icon" />
                  <span className="note-item-title">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Profile & Status Bar */}
      <div className="super-sidebar__footer">
        <div className="sidebar-user-profile" onClick={() => onSelectMode('settings')}>
          <div className="user-avatar">
            <span>{deviceName ? deviceName.charAt(0).toUpperCase() : 'G'}</span>
            <span
              className={`user-avatar-dot ${connectionStatus === 'connected' ? 'user-avatar-dot--online' : ''}`}
            />
          </div>
          <div className="user-details">
            <span className="user-name">{deviceName || 'Genius'}</span>
            <span className="user-status-text">
              {connectionStatus === 'connected' ? 'Çevrim içi' : 'Yerel mod'}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={() => onSelectMode('settings')}
          title="Ayarları Aç"
        >
          <Settings size={15} />
        </button>
      </div>
    </aside>
  )
}
