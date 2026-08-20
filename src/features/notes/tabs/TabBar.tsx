import { useState, type KeyboardEvent } from 'react'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Network from 'lucide-react/dist/esm/icons/network.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { tabStore, useTabs } from '../stores/tabStore'
import { useVault, vaultStore } from '../stores/vaultStore'
import type { NoteTab } from '../types'

interface TabBarProps {
  onNewNote: () => void
}

export function TabBar({ onNewNote }: TabBarProps) {
  const { tabs, activeTabId } = useTabs()
  const { index } = useVault()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tab: NoteTab } | null>(
    null,
  )

  function handleTabClick(tab: NoteTab) {
    tabStore.setActiveTab(tab.id)
  }

  function handleTabClose(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    tabStore.closeTab(tabId)
  }

  function handleOpenGraph() {
    tabStore.openTab('graph', 'graph')
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>, indexInTabs: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    let nextIndex = indexInTabs
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, indexInTabs - 1)
    if (event.key === 'ArrowRight') nextIndex = Math.min(tabs.length - 1, indexInTabs + 1)
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = Math.max(0, tabs.length - 1)

    const nextTab = tabs[nextIndex]
    if (!nextTab) return
    tabStore.setActiveTab(nextTab.id)
    window.requestAnimationFrame(() => {
      const tabNodes = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')
      tabNodes?.[nextIndex]?.focus({ preventScroll: true })
    })
  }

  return (
    <div className="notes-tab-bar" onClick={() => setContextMenu(null)}>
      <div className="notes-tab-scroll" role="tablist" aria-label="Açık notlar">
        {tabs.map((tab, indexInTabs) => {
          const isActive = tab.id === activeTabId
          const isGraph = tab.viewType === 'graph'
          const displayTitle = isGraph ? tab.title : index.files.get(tab.path)?.title || tab.title

          return (
            <div
              key={tab.id}
              className={`note-tab-item ${isActive ? 'note-tab-item--active' : ''}`}
              onClick={() => handleTabClick(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, indexInTabs)}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, tab })
              }}
              title={tab.path}
            >
              {isGraph ? (
                <Network size={13} className="text-sky-400" />
              ) : (
                <FileText size={13} className="text-slate-400" />
              )}
              <span className="note-tab-title">{displayTitle}</span>
              {tab.isDirty && <span className="note-tab-dirty-dot" title="Kaydedilmemiş değişiklikler" />}
              <button
                type="button"
                className="note-tab-close-btn"
                onClick={(e) => handleTabClose(e, tab.id)}
                title="Sekmeyi Kapat"
                aria-label={`${displayTitle} sekmesini kapat`}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="notes-tab-actions">
        <button
          type="button"
          className="notes-tab-action-btn"
          onClick={onNewNote}
          title="Yeni Not Oluştur"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="notes-tab-action-btn"
          onClick={handleOpenGraph}
          title="İlişki Grafiğini Aç"
        >
          <Network size={14} />
        </button>
      </div>

      {/* Tab Context Menu */}
      {contextMenu && (
        <div
          className="notes-tab-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              tabStore.closeTab(contextMenu.tab.id)
              setContextMenu(null)
            }}
          >
            <span>Kapat</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              tabStore.closeOtherTabs(contextMenu.tab.id)
              setContextMenu(null)
            }}
          >
            <span>Diğer Sekmeleri Kapat</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              tabStore.closeAllTabs()
              setContextMenu(null)
            }}
          >
            <span>Tümünü Kapat</span>
          </button>
          {contextMenu.tab.viewType !== 'graph' && (
            <>
              <div className="context-menu-separator" />
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  void vaultStore.revealInExplorer(contextMenu.tab.path)
                  setContextMenu(null)
                }}
              >
                <span>Gezginde Göster</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
