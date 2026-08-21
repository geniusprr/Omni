import React, { useEffect, useMemo, useState } from 'react'
import LayoutTemplate from 'lucide-react/dist/esm/icons/layout-template.js'
import type { MiniOsMode } from '@/components/layout/MiniOsDock'
import {
  BROWSER_DATA_EVENT,
  loadFavorites,
  loadRecentlyClosed,
  loadShortcuts,
  relativeTime,
  saveRecentlyClosed,
  type BrowserShortcut,
} from '@/features/browser/browserData'
import { useVault } from '@/features/notes/stores/vaultStore'
import type {
  PairedController,
  RemoteConnectionStatus,
  TimerAction,
  TimerState,
} from '@/types'
import { CustomizeWidgetsModal } from './widgets/CustomizeWidgetsModal'
import { SystemMediaStatusWidget } from './widgets/YouTubeMusicStatusWidget'
import {
  type BookmarkItem,
  DraggableWidgetGrid,
  type QuickAppItem,
  type RecentPageItem,
  type ToDoItem,
} from './widgets/DraggableWidgetGrid'
import {
  DEFAULT_LAYOUT,
  loadWidgetLayout,
  saveWidgetLayout,
  type WidgetId,
  type WidgetLayoutState,
} from './widgets/widgetRegistry'

interface MiniOsDashboardProps {
  onNavigate: (mode: MiniOsMode) => void
  timer?: TimerState | null
  now?: number
  onSchedulePower?: (action: TimerAction, seconds: number) => Promise<void>
  onCancelPower?: () => Promise<void>
  deviceName?: string
  pairingCode?: string
  connectionStatus?: RemoteConnectionStatus
  pairedControllers?: PairedController[]
  onRefreshControllers?: () => void
  onOpenPairingModal?: () => void
  isCustomizeOpen?: boolean
  onToggleCustomizeOpen?: (open: boolean) => void
}

export function MiniOsDashboard({
  onNavigate,
  timer = null,
  now = Date.now(),
  onSchedulePower = async () => {},
  onCancelPower = async () => {},
  deviceName = 'Windows PC',
  pairingCode = 'KAP-XXXX',
  connectionStatus = 'disconnected',
  pairedControllers = [],
  onRefreshControllers = () => {},
  onOpenPairingModal,
  isCustomizeOpen = false,
  onToggleCustomizeOpen,
}: MiniOsDashboardProps) {
  const { entries } = useVault()

  // Widget Layout State with persistence
  const [layout, setLayout] = useState<WidgetLayoutState>(() => loadWidgetLayout())
  const [localCustomizeOpen, setLocalCustomizeOpen] = useState(false)
  const isCustomizeModalOpen = isCustomizeOpen !== undefined ? isCustomizeOpen : localCustomizeOpen

  function setCustomizeModalOpen(open: boolean) {
    if (onToggleCustomizeOpen) {
      onToggleCustomizeOpen(open)
    } else {
      setLocalCustomizeOpen(open)
    }
  }

  // Persist layout changes
  function handleUpdateLayout(nextLayout: WidgetLayoutState) {
    setLayout(nextLayout)
    saveWidgetLayout(nextLayout)
  }

  function handleHideWidget(id: WidgetId) {
    const nextHidden = Array.from(new Set([...layout.hiddenWidgets, id]))
    const nextLayout = {
      ...layout,
      hiddenWidgets: nextHidden,
    }
    handleUpdateLayout(nextLayout)
  }

  function handleToggleWidget(id: WidgetId) {
    let nextHidden: WidgetId[]
    if (layout.hiddenWidgets.includes(id)) {
      nextHidden = layout.hiddenWidgets.filter((w) => w !== id)
    } else {
      nextHidden = [...layout.hiddenWidgets, id]
    }
    handleUpdateLayout({
      ...layout,
      hiddenWidgets: nextHidden,
    })
  }

  function handleResetLayout() {
    handleUpdateLayout(DEFAULT_LAYOUT)
  }

  // To-Do list state with localStorage persistence
  const [todos, setTodos] = useState<ToDoItem[]>(() => {
    const saved = localStorage.getItem('minios_todos_v2')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // fallback
      }
    }
    return [
      { id: '1', text: 'Proje taslağını tamamla', completed: false },
      { id: '2', text: 'Kod incelemesini yap', completed: true },
      { id: '3', text: 'Günlük hedefleri kontrol et', completed: false },
      { id: '4', text: 'Yeni notlar ekle', completed: false },
    ]
  })

  // Persist To-Dos
  useEffect(() => {
    localStorage.setItem('minios_todos_v2', JSON.stringify(todos))
  }, [todos])

  function handleToggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    )
  }

  function handleAddTodo(text: string) {
    setTodos((prev) => [...prev, { id: Date.now().toString(), text, completed: false }])
  }

  function handleDeleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => loadFavorites().map((item) => ({
    name: item.name,
    domain: new URL(item.url).hostname.replace(/^www\./, ''),
    url: item.url,
    bg: item.color,
    icon: item.iconText,
  })))
  const [quickAccessApps, setQuickAccessApps] = useState<QuickAppItem[]>(() => loadShortcuts().map(toQuickApp))
  const [recentList, setRecentList] = useState<RecentPageItem[]>(() => loadRecentlyClosed().map((item) => ({
    id: item.id,
    title: item.title,
    domain: new URL(item.url).hostname.replace(/^www\./, ''),
    time: relativeTime(item.closedAt),
    url: item.url,
    dotBg: 'var(--color-browser-blue)',
  })))

  useEffect(() => {
    const syncBrowserData = () => {
      setBookmarks(loadFavorites().map((item) => ({
        name: item.name,
        domain: new URL(item.url).hostname.replace(/^www\./, ''),
        url: item.url,
        bg: item.color,
        icon: item.iconText,
      })))
      setQuickAccessApps(loadShortcuts().map(toQuickApp))
      setRecentList(loadRecentlyClosed().map((item) => ({
        id: item.id,
        title: item.title,
        domain: new URL(item.url).hostname.replace(/^www\./, ''),
        time: relativeTime(item.closedAt),
        url: item.url,
        dotBg: 'var(--color-browser-blue)',
      })))
    }
    window.addEventListener(BROWSER_DATA_EVENT, syncBrowserData)
    return () => window.removeEventListener(BROWSER_DATA_EVENT, syncBrowserData)
  }, [])

  // Get most recent note from Vault
  const latestNote = useMemo(() => {
    const mdFiles = entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))
    if (mdFiles.length === 0) return null
    return mdFiles.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0))[0]
  }, [entries])

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-main-layout">
        <div className="dashboard-widgets-area">
          <DraggableWidgetGrid
            layout={layout}
            onUpdateLayout={handleUpdateLayout}
            onHideWidget={handleHideWidget}
            onNavigate={onNavigate}
            todos={todos}
            onToggleTodo={handleToggleTodo}
            onAddTodo={handleAddTodo}
            onDeleteTodo={handleDeleteTodo}
            bookmarks={bookmarks}
            quickAccessApps={quickAccessApps}
            onQuickAccessChange={setQuickAccessApps}
            recentList={recentList}
            onClearRecent={() => {
              saveRecentlyClosed([])
              setRecentList([])
            }}
            latestNote={latestNote}
            timer={timer}
            now={now}
            onSchedulePower={onSchedulePower}
            onCancelPower={onCancelPower}
            deviceName={deviceName}
            pairingCode={pairingCode}
            connectionStatus={connectionStatus}
            pairedControllers={pairedControllers}
            onRefreshControllers={onRefreshControllers}
            onOpenPairingModal={onOpenPairingModal}
          />
          <div className="dashboard-widgets-toolbar dashboard-widgets-toolbar--bottom">
            <button
              type="button"
              className="dashboard-customize-btn"
              onClick={() => setCustomizeModalOpen(true)}
              title="Widget ekle"
              aria-label="Widget ekle"
            >
              <LayoutTemplate size={13} aria-hidden="true" />
              <span>Widget ekle</span>
            </button>
          </div>
        </div>

        <div className="dashboard-music-sticky-col">
          <SystemMediaStatusWidget />
        </div>

      </div>

      {/* Customize Widgets Modal */}
      <CustomizeWidgetsModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setCustomizeModalOpen(false)}
        layout={layout}
        onToggleWidget={handleToggleWidget}
        onResetLayout={handleResetLayout}
      />
    </div>
  )
}

function toQuickApp(item: BrowserShortcut): QuickAppItem {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    target: item.target,
    bg: item.color,
    iconText: item.iconText,
  }
}
