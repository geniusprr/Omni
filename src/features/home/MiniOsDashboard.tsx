import React, { useEffect, useMemo, useState } from 'react'
import LayoutTemplate from 'lucide-react/dist/esm/icons/layout-template.js'
import Music2 from 'lucide-react/dist/esm/icons/music-2.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import type { MiniOsMode } from '@/components/layout/MiniOsDock'
import { useVault } from '@/features/notes/stores/vaultStore'
import type {
  PairedController,
  RemoteConnectionStatus,
  TimerAction,
  TimerState,
} from '@/types'
import { CustomizeWidgetsModal } from './widgets/CustomizeWidgetsModal'
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
import { YouTubeMusicWidget } from './widgets/YouTubeMusicWidget'

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
  onRefreshControllers,
}: MiniOsDashboardProps) {
  const { entries } = useVault()

  // Widget Layout State with persistence
  const [layout, setLayout] = useState<WidgetLayoutState>(() => loadWidgetLayout())
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false)
  const [isMusicPlayerOpen, setIsMusicPlayerOpen] = useState<boolean>(() => {
    return localStorage.getItem('minios_music_player_open') !== 'false'
  })

  function handleToggleMusicPlayer(open?: boolean) {
    const next = open !== undefined ? open : !isMusicPlayerOpen
    setIsMusicPlayerOpen(next)
    localStorage.setItem('minios_music_player_open', next.toString())
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
      { id: '1', text: 'Finish project proposal', completed: false },
      { id: '2', text: 'Review pull request', completed: true },
      { id: '3', text: 'Buy groceries', completed: false },
      { id: '4', text: "Read 'Atomic Habits'", completed: false },
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

  // Bookmarks List
  const bookmarks: BookmarkItem[] = [
    { name: 'YouTube', domain: 'youtube.com', url: 'https://youtube.com', bg: '#ef4444', icon: '▶' },
    { name: 'Reddit', domain: 'reddit.com', url: 'https://reddit.com', bg: '#ff4500', icon: '●' },
    { name: 'GitHub', domain: 'github.com', url: 'https://github.com', bg: '#24292e', icon: '⌨' },
    { name: 'Hacker News', domain: 'news.ycombinator.com', url: 'https://news.ycombinator.com', bg: '#ff6600', icon: 'Y' },
    { name: 'Twitter', domain: 'x.com', url: 'https://x.com', bg: '#000000', icon: '𝕏' },
    { name: 'Netflix', domain: 'netflix.com', url: 'https://netflix.com', bg: '#e50914', icon: 'N' },
  ]

  // Quick Access 8-Grid
  const quickAccessApps: QuickAppItem[] = [
    { name: 'YouTube', url: 'https://youtube.com', bg: '#ef4444', iconText: '▶' },
    { name: 'GitHub', url: 'https://github.com', bg: '#181d28', iconText: '⌨' },
    { name: 'Gmail', url: 'https://mail.google.com', bg: '#ea4335', iconText: 'M' },
    { name: 'Drive', url: 'https://drive.google.com', bg: '#34a853', iconText: '▲' },
    { name: 'Notion', url: 'https://notion.so', bg: '#000000', iconText: 'N' },
    { name: 'ChatGPT', url: 'https://chatgpt.com', bg: '#10a37f', iconText: '⌘' },
    { name: 'Twitter', url: 'https://x.com', bg: '#000000', iconText: '𝕏' },
  ]

  // Recently Closed
  const [recentList, setRecentList] = useState<RecentPageItem[]>([
    { id: '1', title: 'Design Inspiration – Dribbble', domain: 'dribbble.com', time: '2m ago', url: 'https://dribbble.com', dotBg: '#ea4c89' },
    { id: '2', title: 'Build beautiful products faster', domain: 'linear.app', time: '15m ago', url: 'https://linear.app', dotBg: '#5e6ad2' },
    { id: '3', title: 'Dashboard – Red Library', domain: 'localhost:5173', time: '1h ago', url: 'http://localhost:5173', dotBg: '#ef4444' },
  ])

  // Get most recent note from Vault
  const latestNote = useMemo(() => {
    const mdFiles = entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))
    if (mdFiles.length === 0) return null
    return mdFiles.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0))[0]
  }, [entries])

  return (
    <div className="dashboard-wrapper">
      {/* 2-SECTION LAYOUT: LEFT DRAGGABLE WIDGETS + RIGHT STICKY TALL YOUTUBE MUSIC */}
      <div className={`dashboard-main-layout ${!isMusicPlayerOpen ? 'dashboard-main-layout--single-col' : ''}`}>
        {/* LEFT / CENTER: DRAGGABLE & CUSTOMIZABLE WIDGETS */}
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
            recentList={recentList}
            onClearRecent={() => setRecentList([])}
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
          />
        </div>

        {/* RIGHT: STICKY VERTICAL YOUTUBE MUSIC PLAYER */}
        {isMusicPlayerOpen && (
          <div className="dashboard-music-sticky-col">
            <YouTubeMusicWidget
              variant="tall"
              onHide={() => handleToggleMusicPlayer(false)}
            />
          </div>
        )}
      </div>

      {/* BOTTOM ACTION & MOTTO BAR */}
      <div className="dashboard-footer-bar">
        <div className="bottom-motto-pill">
          <Sparkles size={13} className="motto-star-icon" />
          <span>Stay curious, keep learning.</span>
        </div>

        <div className="dashboard-footer-actions-group">
          {!isMusicPlayerOpen && (
            <button
              type="button"
              className="dashboard-customize-btn"
              onClick={() => handleToggleMusicPlayer(true)}
              title="Müzik Çaları Aç"
            >
              <Music2 size={13} />
              <span>Müzik Çalar</span>
            </button>
          )}

          <button
            type="button"
            className="dashboard-customize-btn"
            onClick={() => setIsCustomizeModalOpen(true)}
            title="Widgetları Aç/Kapat & Sıfırla"
          >
            <LayoutTemplate size={13} />
            <span>Widgetları Düzenle</span>
          </button>
        </div>
      </div>

      {/* Customize Widgets Modal */}
      <CustomizeWidgetsModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
        layout={layout}
        onToggleWidget={handleToggleWidget}
        onResetLayout={handleResetLayout}
      />
    </div>
  )
}
