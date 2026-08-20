import { useMemo, useState } from 'react'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import Edit2 from 'lucide-react/dist/esm/icons/edit-2.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FilePlus from 'lucide-react/dist/esm/icons/file-plus.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js'
import FolderPlus from 'lucide-react/dist/esm/icons/folder-plus.js'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive.js'
import MoreVertical from 'lucide-react/dist/esm/icons/more-vertical.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import { tabStore, useTabs } from '../stores/tabStore'
import { useVault, vaultStore } from '../stores/vaultStore'
import type { VaultFileEntry } from '../types'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

export function FileExplorer() {
  const { vaultPath, entries, loading } = useVault()
  const { tabs, activeTabId } = useTabs()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
  const [filterQuery, setFilterQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    path: string
    isDir: boolean
  } | null>(null)

  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)
  const [creatingParent, setCreatingParent] = useState<string>('')
  const [creatingName, setCreatingName] = useState('')

  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState('')

  // Build tree from flat entries
  const tree = useMemo(() => {
    const root: TreeNode = { name: '', path: '', isDir: true, children: [] }

    const sortedEntries = [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.path.localeCompare(b.path)
    })

    for (const entry of sortedEntries) {
      if (filterQuery && !entry.isDir && !entry.name.toLowerCase().includes(filterQuery.toLowerCase())) {
        continue
      }

      const parts = entry.path.split('/')
      let current = root

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const isLast = i === parts.length - 1
        const nodePath = parts.slice(0, i + 1).join('/')

        let existing = current.children.find((c) => c.name === part)
        if (!existing) {
          existing = {
            name: part,
            path: nodePath,
            isDir: isLast ? entry.isDir : true,
            children: [],
          }
          current.children.push(existing)
        }
        current = existing
      }
    }

    return root
  }, [entries, filterQuery])

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function handleCreateSubmit() {
    if (!creatingName.trim()) {
      setCreatingType(null)
      return
    }

    const targetRel = creatingParent
      ? `${creatingParent}/${creatingName.trim()}`
      : creatingName.trim()

    if (creatingType === 'file') {
      const cleanPath = targetRel.endsWith('.md') ? targetRel : `${targetRel}.md`
      void (async () => {
        await vaultStore.createNote(cleanPath)
        tabStore.openTab(cleanPath)
      })()
    } else if (creatingType === 'folder') {
      void vaultStore.createFolder(targetRel)
      setExpandedFolders((prev) => new Set(prev).add(targetRel))
    }

    setCreatingType(null)
    setCreatingName('')
    setCreatingParent('')
  }

  function handleRenameSubmit() {
    if (!renamingPath || !renamingName.trim()) {
      setRenamingPath(null)
      return
    }

    const parent = renamingPath.includes('/')
      ? renamingPath.substring(0, renamingPath.lastIndexOf('/'))
      : ''
    const isDir = entries.find((e) => e.path === renamingPath)?.isDir ?? false
    let newFileName = renamingName.trim()
    if (!isDir && !newFileName.endsWith('.md')) {
      newFileName += '.md'
    }

    const newRelPath = parent ? `${parent}/${newFileName}` : newFileName
    void (async () => {
      await vaultStore.renameEntry(renamingPath, newRelPath)
      tabStore.updateTabPath(renamingPath, newRelPath)
    })()

    setRenamingPath(null)
    setRenamingName('')
  }

  function handleDelete(path: string) {
    const isDir = entries.find((e) => e.path === path)?.isDir ?? false
    const promptMsg = isDir
      ? `"${path}" klasörünü ve içindeki tüm notları silmek istediğinize emin misiniz?`
      : `"${path}" notunu silmek istediğinize emin misiniz?`

    if (window.confirm(promptMsg)) {
      void vaultStore.deleteEntry(path)
      const tabToClose = tabs.find((t) => t.path === path)
      if (tabToClose) {
        tabStore.closeTab(tabToClose.id)
      }
    }
  }

  function renderTree(nodes: TreeNode[], depth = 0) {
    return (
      <div className="explorer-tree-level">
        {nodes.map((node) => {
          const isExpanded = filterQuery.trim().length > 0 || expandedFolders.has(node.path)
          const isSelected = activeTab?.path === node.path
          const isRenaming = renamingPath === node.path

          if (node.isDir) {
            return (
              <div key={node.path} className="explorer-folder-block">
                <div
                  className={`explorer-item explorer-item--folder ${isSelected ? 'explorer-item--active' : ''}`}
                  style={{ paddingLeft: `${depth * 14 + 10}px` }}
                  onClick={() => toggleFolder(node.path)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleFolder(node.path)
                    }
                  }}
                  role="treeitem"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${node.name} klasörü`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: true })
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('explorer-drop-target')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('explorer-drop-target')
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('explorer-drop-target')
                    const draggedPath = e.dataTransfer.getData('text/plain')
                    if (draggedPath && draggedPath !== node.path) {
                      const fileName = draggedPath.split('/').pop() || ''
                      const newPath = node.path ? `${node.path}/${fileName}` : fileName
                      void vaultStore.renameEntry(draggedPath, newPath)
                    }
                  }}
                >
                  <button type="button" className="explorer-item__expand-btn">
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  {isExpanded ? <FolderOpen size={14} className="explorer-folder-icon" /> : <Folder size={14} className="explorer-folder-icon" />}
                  {isRenaming ? (
                    <input
                      autoFocus
                      className="explorer-inline-input"
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit()
                        if (e.key === 'Escape') setRenamingPath(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="explorer-item__title">{node.name}</span>
                  )}
                  <button
                    type="button"
                    className="explorer-item__menu-trigger"
                    onClick={(e) => {
                      e.stopPropagation()
                      setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: true })
                    }}
                  >
                    <MoreVertical size={13} />
                  </button>
                </div>

                {isExpanded && node.children.length > 0 && (
                  <div>{renderTree(node.children, depth + 1)}</div>
                )}
              </div>
            )
          }

          // File
          const cleanTitle = node.name.replace(/\.md$/i, '')
          return (
            <div
              key={node.path}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', node.path)
              }}
              className={`explorer-item explorer-item--file ${isSelected ? 'explorer-item--active' : ''}`}
              style={{ paddingLeft: `${depth * 14 + 28}px` }}
              onClick={() => tabStore.openTab(node.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  tabStore.openTab(node.path)
                }
              }}
              role="treeitem"
              tabIndex={0}
              aria-selected={isSelected}
              aria-label={`${cleanTitle} notunu aç`}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: false })
              }}
            >
              <FileText size={14} className="explorer-file-icon" />
              {isRenaming ? (
                <input
                  autoFocus
                  className="explorer-inline-input"
                  value={renamingName}
                  onChange={(e) => setRenamingName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit()
                    if (e.key === 'Escape') setRenamingPath(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="explorer-item__title">{cleanTitle}</span>
              )}
              <button
                type="button"
                className="explorer-item__menu-trigger"
                onClick={(e) => {
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: false })
                }}
              >
                <MoreVertical size={13} />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="file-explorer" onClick={() => setContextMenu(null)}>
      {/* Header / Vault bar */}
      <div className="explorer-header">
        <div className="explorer-vault-info" title={vaultPath || ''}>
          <HardDrive size={14} className="explorer-vault-icon" />
          <span className="explorer-vault-name">
            {vaultPath ? vaultPath.split(/[/\\]/).pop() : 'Vault'}
          </span>
        </div>

        <div className="explorer-actions">
          <button
            type="button"
            className="explorer-action-btn"
            title="Yeni Not"
            onClick={() => {
              setCreatingParent('')
              setCreatingType('file')
              setCreatingName('')
            }}
          >
            <FilePlus size={14} />
          </button>
          <button
            type="button"
            className="explorer-action-btn"
            title="Yeni Klasör"
            onClick={() => {
              setCreatingParent('')
              setCreatingType('folder')
              setCreatingName('')
            }}
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            className="explorer-action-btn"
            title="Vault Değiştir"
            onClick={() => void vaultStore.selectNewVault()}
          >
            <HardDrive size={14} />
          </button>
        </div>
      </div>

      {/* Filter search */}
      <div className="explorer-search-bar">
        <Search size={13} className="explorer-search-icon" />
        <input
          type="text"
          placeholder="Dosyalarda filtrele..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="explorer-search-input"
        />
      </div>

      {/* Inline Create Row */}
      {creatingType && (
        <div className="explorer-create-row">
          {creatingType === 'file' ? <FileText size={14} className="explorer-file-icon" /> : <Folder size={14} className="explorer-folder-icon" />}
          <input
            autoFocus
            type="text"
            placeholder={creatingType === 'file' ? 'Not adı...' : 'Klasör adı...'}
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onBlur={handleCreateSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit()
              if (e.key === 'Escape') setCreatingType(null)
            }}
            className="explorer-inline-input"
          />
        </div>
      )}

      {/* Tree view */}
      <div className="explorer-scroll-area" role="tree" aria-label="Vault dosyaları">
        {loading ? (
          <div className="explorer-loading">Yükleniyor...</div>
        ) : tree.children.length === 0 ? (
          <div className="explorer-empty">
            <p>Vault boş.</p>
            <span>Yeni bir not veya klasör oluşturun.</span>
          </div>
        ) : (
          renderTree(tree.children)
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="explorer-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isDir && (
            <>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  setCreatingParent(contextMenu.path)
                  setCreatingType('file')
                  setCreatingName('')
                  setExpandedFolders((prev) => new Set(prev).add(contextMenu.path))
                  setContextMenu(null)
                }}
              >
                <FilePlus size={13} />
                <span>Burada Yeni Not</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  setCreatingParent(contextMenu.path)
                  setCreatingType('folder')
                  setCreatingName('')
                  setExpandedFolders((prev) => new Set(prev).add(contextMenu.path))
                  setContextMenu(null)
                }}
              >
                <FolderPlus size={13} />
                <span>Burada Yeni Klasör</span>
              </button>
              <div className="context-menu-separator" />
            </>
          )}
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              const base = contextMenu.path.split('/').pop() || ''
              setRenamingPath(contextMenu.path)
              setRenamingName(contextMenu.isDir ? base : base.replace(/\.md$/i, ''))
              setContextMenu(null)
            }}
          >
            <Edit2 size={13} />
            <span>Yeniden Adlandır</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              void vaultStore.revealInExplorer(contextMenu.path)
              setContextMenu(null)
            }}
          >
            <ExternalLink size={13} />
            <span>Windows Gezgini'nde Göster</span>
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item context-menu-item--danger"
            onClick={() => {
              handleDelete(contextMenu.path)
              setContextMenu(null)
            }}
          >
            <Trash2 size={13} />
            <span>Sil</span>
          </button>
        </div>
      )}
    </div>
  )
}
