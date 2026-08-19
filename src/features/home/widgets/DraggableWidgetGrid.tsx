import React, { useEffect, useRef, useState } from 'react'
import Check from 'lucide-react/dist/esm/icons/check.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import EyeOff from 'lucide-react/dist/esm/icons/eye-off.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import GripHorizontal from 'lucide-react/dist/esm/icons/grip-horizontal.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import Quote from 'lucide-react/dist/esm/icons/quote.js'
import Radio from 'lucide-react/dist/esm/icons/radio.js'
import Send from 'lucide-react/dist/esm/icons/send.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { MiniOsMode } from '@/components/layout/MiniOsDock'
import { tabStore } from '@/features/notes/stores/tabStore'
import { durationLabel, targetLabel } from '@/lib/format'
import type {
  PairedController,
  RemoteConnectionStatus,
  TimerAction,
  TimerState,
} from '@/types'
import type { WidgetId, WidgetLayoutState } from './widgetRegistry'
import { WeatherWidget } from './WeatherWidget'

export interface ToDoItem {
  id: string
  text: string
  completed: boolean
}

export interface BookmarkItem {
  name: string
  domain: string
  url: string
  bg: string
  icon: string
}

export interface QuickAppItem {
  name: string
  url: string
  bg: string
  iconText: string
}

export interface RecentPageItem {
  id: string
  title: string
  domain: string
  time: string
  url: string
  dotBg: string
}

interface DraggableWidgetGridProps {
  layout: WidgetLayoutState
  onUpdateLayout: (nextLayout: WidgetLayoutState) => void
  onHideWidget: (id: WidgetId) => void
  onNavigate: (mode: MiniOsMode) => void
  // Data props
  todos: ToDoItem[]
  onToggleTodo: (id: string) => void
  onAddTodo: (text: string) => void
  onDeleteTodo: (id: string) => void
  bookmarks: BookmarkItem[]
  quickAccessApps: QuickAppItem[]
  recentList: RecentPageItem[]
  onClearRecent: () => void
  latestNote: { path: string; name: string } | null
  timer: TimerState | null
  now: number
  onSchedulePower: (action: TimerAction, seconds: number) => Promise<void>
  onCancelPower: () => Promise<void>
  deviceName?: string
  pairingCode?: string
  connectionStatus?: RemoteConnectionStatus
  pairedControllers?: PairedController[]
  onRefreshControllers?: () => void
}

interface DragState {
  widgetId: WidgetId
  fromCol: number
  fromIndex: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  isDraggingActive: boolean
}

export function DraggableWidgetGrid({
  layout,
  onUpdateLayout,
  onHideWidget,
  onNavigate,
  todos,
  onToggleTodo,
  onAddTodo,
  onDeleteTodo,
  bookmarks,
  quickAccessApps,
  recentList,
  onClearRecent,
  latestNote,
  timer,
  now,
  onSchedulePower,
  onCancelPower,
  deviceName = 'Windows PC',
  pairingCode = 'KAP-XXXX',
  connectionStatus = 'disconnected',
  pairedControllers = [],
  onRefreshControllers,
}: DraggableWidgetGridProps) {
  // POINTER-BASED DRAG & DROP ENGINE (100% reliable in Tauri / WebViews)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropTargetCol, setDropTargetCol] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const columnsRef = useRef<(HTMLDivElement | null)[]>([])
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Local widget states
  const [showAddTodo, setShowAddTodo] = useState(false)
  const [newTodoText, setNewTodoText] = useState('')
  const [powerAction, setPowerAction] = useState<TimerAction>('shutdown')

  const hiddenSet = new Set(layout.hiddenWidgets)
  const remainingSeconds = timer ? Math.max(0, Math.ceil((timer.targetAt - now) / 1000)) : 0
  const completedCount = todos.filter((t) => t.completed).length

  function handleOpenUrl(url: string) {
    window.open(url, '_blank')
  }

  function handleTodoSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newTodoText.trim()) return
    onAddTodo(newTodoText.trim())
    setNewTodoText('')
    setShowAddTodo(false)
  }

  // Pointer Drag Handlers
  function handlePointerDown(e: React.PointerEvent, widgetId: WidgetId, colIdx: number, itemIdx: number) {
    // Only left click
    if (e.button !== 0) return
    // If clicking an interactive element inside the card, don't drag
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('.bookmark-item-row') ||
      target.closest('.qa-app-tile') ||
      target.closest('.todo-row') ||
      target.closest('.recent-item-row')
    ) {
      return
    }

    e.preventDefault()
    setDragState({
      widgetId,
      fromCol: colIdx,
      fromIndex: itemIdx,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isDraggingActive: false,
    })
  }

  useEffect(() => {
    if (!dragState) return

    function handlePointerMove(e: PointerEvent) {
      if (!dragState) return

      const dx = Math.abs(e.clientX - dragState.startX)
      const dy = Math.abs(e.clientY - dragState.startY)
      const isDraggingActive = dragState.isDraggingActive || dx > 5 || dy > 5

      setDragState((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY, isDraggingActive } : null))

      if (isDraggingActive) {
        // Calculate which column pointer is over
        let targetCol = 0
        let closestDist = Infinity

        columnsRef.current.forEach((colEl, idx) => {
          if (!colEl) return
          const rect = colEl.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const dist = Math.abs(e.clientX - centerX)
          if (dist < closestDist) {
            closestDist = dist
            targetCol = idx
          }
        })

        // Calculate item position in target column
        let targetIdx = 0
        const colEl = columnsRef.current[targetCol]
        if (colEl) {
          const childWidgets = Array.from(colEl.querySelectorAll('.widget-wrapper'))
          for (let i = 0; i < childWidgets.length; i++) {
            const rect = childWidgets[i].getBoundingClientRect()
            if (e.clientY > rect.top + rect.height / 2) {
              targetIdx = i + 1
            }
          }
        }

        setDropTargetCol(targetCol)
        setDropTargetIndex(targetIdx)
      }
    }

    function handlePointerUp() {
      if (dragState && dragState.isDraggingActive && dropTargetCol !== null && dropTargetIndex !== null) {
        // Apply reordering
        const nextColumns = layout.columns.map((col) => [...col])

        // Remove from old pos
        for (let c = 0; c < nextColumns.length; c++) {
          const idx = nextColumns[c].indexOf(dragState.widgetId)
          if (idx !== -1) {
            nextColumns[c].splice(idx, 1)
            break
          }
        }

        // Insert at new pos
        if (!nextColumns[dropTargetCol]) {
          nextColumns[dropTargetCol] = []
        }
        const safeIdx = Math.min(Math.max(0, dropTargetIndex), nextColumns[dropTargetCol].length)
        nextColumns[dropTargetCol].splice(safeIdx, 0, dragState.widgetId)

        onUpdateLayout({
          ...layout,
          columns: nextColumns,
        })
      }

      setDragState(null)
      setDropTargetCol(null)
      setDropTargetIndex(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragState, dropTargetCol, dropTargetIndex, layout, onUpdateLayout])

  // Quick Move Controls
  function handleMoveWidget(widgetId: WidgetId, direction: 'left' | 'right' | 'up' | 'down') {
    const nextColumns = layout.columns.map((col) => [...col])
    let curCol = -1
    let curIdx = -1

    for (let c = 0; c < nextColumns.length; c++) {
      const idx = nextColumns[c].indexOf(widgetId)
      if (idx !== -1) {
        curCol = c
        curIdx = idx
        break
      }
    }

    if (curCol === -1) return

    if (direction === 'up' && curIdx > 0) {
      const temp = nextColumns[curCol][curIdx - 1]
      nextColumns[curCol][curIdx - 1] = widgetId
      nextColumns[curCol][curIdx] = temp
    } else if (direction === 'down' && curIdx < nextColumns[curCol].length - 1) {
      const temp = nextColumns[curCol][curIdx + 1]
      nextColumns[curCol][curIdx + 1] = widgetId
      nextColumns[curCol][curIdx] = temp
    } else if (direction === 'left' && curCol > 0) {
      nextColumns[curCol].splice(curIdx, 1)
      nextColumns[curCol - 1].push(widgetId)
    } else if (direction === 'right' && curCol < nextColumns.length - 1) {
      nextColumns[curCol].splice(curIdx, 1)
      nextColumns[curCol + 1].push(widgetId)
    }

    onUpdateLayout({
      ...layout,
      columns: nextColumns,
    })
  }

  // Render individual widget card content
  function renderWidget(id: WidgetId, _colIdx: number, _itemIdx: number) {
    switch (id) {
      case 'bookmarks':
        return (
          <div className="glass-widget-card card-bookmarks widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <span className="card-heading">Yer İmleri</span>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-pill-btn"
                  onClick={() => onNavigate('notes')}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('bookmarks')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            <div className="bookmarks-rows-group">
              {bookmarks.map((bm) => (
                <div
                  key={bm.name}
                  className="bookmark-item-row"
                  onClick={() => handleOpenUrl(bm.url)}
                >
                  <div className="bm-icon-circle" style={{ backgroundColor: bm.bg }}>
                    <span>{bm.icon}</span>
                  </div>
                  <span className="bm-site-name">{bm.name}</span>
                  <span className="bm-site-domain">{bm.domain}</span>
                  <ChevronRight size={12} className="bm-chevron" />
                </div>
              ))}
            </div>
          </div>
        )

      case 'notes':
        return (
          <div className="glass-widget-card card-sticky-note widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <div className="card-heading-with-icon">
                  <FileText size={14} className="note-title-icon" />
                  <span>Notlar</span>
                </div>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-plus-btn"
                  onClick={() => onNavigate('notes')}
                  title="Yeni Not Ekle"
                >
                  <Plus size={13} />
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('notes')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            <div
              className="sticky-note-body"
              onClick={() => {
                if (latestNote) tabStore.openTab(latestNote.path)
                onNavigate('notes')
              }}
            >
              <p className="sticky-body-text">
                {latestNote
                  ? `${latestNote.name.replace(/\.md$/i, '')} notunu incele ve görevleri tamamla.`
                  : "Mükemmelliğe değil, ilerlemeye odaklanmayı unutma."}
              </p>
              <span className="sticky-body-date">Son güncelleme</span>
            </div>
          </div>
        )

      case 'quickAccess':
        return (
          <div className="glass-widget-card card-quick-access widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <span className="card-heading">Hızlı Erişim</span>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-pill-btn"
                  onClick={() => onNavigate('settings')}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('quickAccess')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            <div className="quick-access-8grid">
              {quickAccessApps.map((app) => (
                <div
                  key={app.name}
                  className="qa-app-tile"
                  onClick={() => handleOpenUrl(app.url)}
                >
                  <div className="qa-app-squircle" style={{ backgroundColor: app.bg }}>
                    <span>{app.iconText}</span>
                  </div>
                  <span className="qa-app-label">{app.name}</span>
                </div>
              ))}

              <div
                className="qa-app-tile qa-app-tile--add"
                onClick={() => onNavigate('settings')}
              >
                <div className="qa-app-squircle qa-app-squircle--dashed">
                  <Plus size={14} />
                </div>
                <span className="qa-app-label">Ekle</span>
              </div>
            </div>
          </div>
        )

      case 'quote':
        return (
          <div className="glass-widget-card card-quote widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <div className="quote-badge-symbol">
                  <Quote size={14} />
                </div>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('quote')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>
            <p className="quote-body-quote">
              Geleceği tahmin etmenin en iyi yolu, onu yaratmaktır.
            </p>
            <span className="quote-author-name">— Peter Drucker</span>
          </div>
        )

      case 'recentlyClosed':
        return (
          <div className="glass-widget-card card-recently-closed widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <span className="card-heading">Son Kapatılanlar</span>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-pill-btn"
                  onClick={onClearRecent}
                >
                  Temizle
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('recentlyClosed')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            <div className="recent-rows-group">
              {recentList.map((item) => (
                <div
                  key={item.id}
                  className="recent-item-row"
                  onClick={() => handleOpenUrl(item.url)}
                >
                  <div className="recent-color-dot" style={{ backgroundColor: item.dotBg }} />
                  <div className="recent-text-box">
                    <span className="recent-page-title">{item.title}</span>
                    <span className="recent-page-domain">{item.domain}</span>
                  </div>
                  <span className="recent-time-ago">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'todos':
        return (
          <div className="glass-widget-card card-todo widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <span className="card-heading">Görevler</span>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-pill-btn card-pill-btn--add"
                  onClick={() => setShowAddTodo((p) => !p)}
                >
                  <Plus size={11} />
                  <span>Ekle</span>
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('todos')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            {showAddTodo && (
              <form className="todo-inline-add-form" onSubmit={handleTodoSubmit}>
                <input
                  type="text"
                  className="todo-inline-add-input"
                  placeholder="Yeni görev..."
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="todo-inline-submit-btn">
                  <Check size={11} />
                </button>
              </form>
            )}

            <div className="todo-items-stack">
              {todos.map((item) => (
                <div
                  key={item.id}
                  className={`todo-row ${item.completed ? 'todo-row--completed' : ''}`}
                  onClick={() => onToggleTodo(item.id)}
                >
                  <button type="button" className="todo-circle-btn" aria-label="Toggle task">
                    {item.completed ? (
                      <div className="todo-checked-circle">
                        <Check size={9} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="todo-unchecked-circle" />
                    )}
                  </button>
                  <span className="todo-label-text">{item.text}</span>
                  <button
                    type="button"
                    className="todo-remove-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteTodo(item.id)
                    }}
                    title="Sil"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="todo-progress-footer">
              <div className="todo-progress-txt">
                Tamamlanan: {completedCount}/{todos.length}
              </div>
              <div className="todo-track-bar">
                <div
                  className="todo-fill-bar"
                  style={{
                    width: `${todos.length > 0 ? (completedCount / todos.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )

      case 'powerWidget':
        return (
          <div className="glass-widget-card home-widget-card--power widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <div className="widget-card__title">
                  <Power size={14} className="text-amber-400" />
                  <span className="card-heading">Güç Sayacı</span>
                </div>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-pill-btn"
                  onClick={() => onNavigate('power')}
                >
                  Yönet
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('powerWidget')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            <div className="widget-card__content">
              {timer ? (
                <div className="widget-power-active">
                  <div className="widget-power-countdown">{durationLabel(remainingSeconds)}</div>
                  <p className="widget-power-target">
                    <Clock3 size={12} />
                    <span>Hedef: {targetLabel(timer.targetAt)}</span>
                  </p>
                  <button
                    type="button"
                    className="widget-power-cancel-btn"
                    onClick={() => void onCancelPower()}
                  >
                    <X size={13} />
                    <span>Planı İptal Et</span>
                  </button>
                </div>
              ) : (
                <div className="widget-power-presets">
                  <div className="widget-power-action-toggle">
                    <button
                      type="button"
                      className={`power-toggle-chip ${powerAction === 'shutdown' ? 'power-toggle-chip--active' : ''}`}
                      onClick={() => setPowerAction('shutdown')}
                    >
                      Kapat
                    </button>
                    <button
                      type="button"
                      className={`power-toggle-chip ${powerAction === 'restart' ? 'power-toggle-chip--active' : ''}`}
                      onClick={() => setPowerAction('restart')}
                    >
                      Yeniden Başlat
                    </button>
                  </div>

                  <div className="widget-presets-grid">
                    {[
                      { label: '15 dk', sec: 15 * 60 },
                      { label: '30 dk', sec: 30 * 60 },
                      { label: '45 dk', sec: 45 * 60 },
                      { label: '1 saat', sec: 60 * 60 },
                    ].map((p) => (
                      <button
                        key={p.sec}
                        type="button"
                        className="widget-preset-btn"
                        onClick={() => void onSchedulePower(powerAction, p.sec)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 'devices':
        return (
          <div className="glass-widget-card home-widget-card--devices widget-drag-card">
            <div className="card-top-bar">
              <div className="widget-header-title-group">
                <GripHorizontal size={13} className="widget-drag-handle" />
                <div className="card-heading-with-icon">
                  <Smartphone size={14} className="text-emerald-400" />
                  <span>Cihazlar & Bağlantı</span>
                </div>
              </div>
              <div className="widget-header-actions">
                <button
                  type="button"
                  className="card-pill-btn"
                  onClick={() => onNavigate('remote')}
                >
                  Yönet
                </button>
                <button
                  type="button"
                  className="widget-hide-btn"
                  onClick={() => onHideWidget('devices')}
                  title="Gizle"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            </div>

            <div className="widget-card__content">
              {/* Current Device Badge */}
              <div className="widget-device-current-box">
                <div className="widget-device-info-left">
                  <div className="widget-device-icon-box">
                    <Laptop size={14} className="text-slate-600 dark:text-slate-300" />
                  </div>
                  <div className="widget-device-text-meta">
                    <span className="widget-device-name">{deviceName}</span>
                    <span className="widget-device-status-text">
                      <span className={`status-micro-dot ${connectionStatus === 'connected' ? 'status-micro-dot--online' : ''}`} />
                      {connectionStatus === 'connected' ? 'Bulut Bağlantısı Aktif' : 'Yerel Ağ Modu'}
                    </span>
                  </div>
                </div>

                <div className="widget-pairing-badge" title="Eşleşme Kodu">
                  <QrCode size={11} className="text-sky-400" />
                  <span className="font-mono font-bold text-sky-400">{pairingCode}</span>
                </div>
              </div>

              {/* Paired Remote Controllers List */}
              <div className="widget-controllers-section">
                <div className="widget-controllers-header">
                  <span>Bağlı Kontrolcüler</span>
                  <span className="widget-controllers-count">{pairedControllers.length}</span>
                </div>

                {pairedControllers.length > 0 ? (
                  <div className="widget-controllers-list">
                    {pairedControllers.map((ctrl) => (
                      <div key={ctrl.id} className="widget-controller-row">
                        <div className="widget-ctrl-icon">
                          <Smartphone size={12} className="text-slate-400" />
                        </div>
                        <div className="widget-ctrl-info">
                          <span className="widget-ctrl-name">{ctrl.controllerName || 'Mobil Cihaz'}</span>
                          <span className="widget-ctrl-type">{ctrl.controllerType || 'Android'}</span>
                        </div>
                        <span className="status-micro-dot status-micro-dot--online" title="Aktif" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="widget-no-controllers">
                    <span>Bağlı mobil kontrolcü yok.</span>
                    <button
                      type="button"
                      className="widget-mini-link-btn"
                      onClick={() => onNavigate('remote')}
                    >
                      + Mobil Eşle
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Actions Footer */}
              <div className="widget-device-quick-actions">
                <button
                  type="button"
                  className="widget-device-action-pill"
                  onClick={() => onNavigate('remote')}
                >
                  <Wifi size={11} />
                  <span>Mobil Panel</span>
                </button>
                <button
                  type="button"
                  className="widget-device-action-pill"
                  onClick={() => onNavigate('localsend')}
                >
                  <Send size={11} />
                  <span>Dosya Paylaş</span>
                </button>
              </div>
            </div>
          </div>
        )

      case 'weather':
        return <WeatherWidget onHide={() => onHideWidget('weather')} />

      default:
        return null
    }
  }

  return (
    <div className="draggable-columns-grid">
      {layout.columns.map((colWidgets, colIdx) => {
        const visibleWidgets = colWidgets.filter((wId) => !hiddenSet.has(wId))

        return (
          <div
            key={colIdx}
            ref={(el) => {
              columnsRef.current[colIdx] = el
            }}
            className={`dashboard-column dashboard-column--droppable ${
              dropTargetCol === colIdx ? 'dashboard-column--dragover' : ''
            }`}
          >
            {visibleWidgets.map((wId, itemIdx) => {
              const isBeingDragged = dragState?.widgetId === wId && dragState.isDraggingActive
              const isTargetIndicator =
                dragState?.isDraggingActive && dropTargetCol === colIdx && dropTargetIndex === itemIdx

              return (
                <React.Fragment key={wId}>
                  {isTargetIndicator && <div className="widget-drop-indicator" />}
                  <div
                    ref={(el) => {
                      widgetRefs.current[wId] = el
                    }}
                    className={`widget-wrapper ${isBeingDragged ? 'widget-wrapper--dragging' : ''}`}
                    onPointerDown={(e) => handlePointerDown(e, wId, colIdx, itemIdx)}
                  >
                    {renderWidget(wId, colIdx, itemIdx)}
                  </div>
                </React.Fragment>
              )
            })}

            {dragState?.isDraggingActive &&
              dropTargetCol === colIdx &&
              dropTargetIndex !== null &&
              dropTargetIndex >= visibleWidgets.length && (
                <div className="widget-drop-indicator" />
              )}

            {visibleWidgets.length === 0 && (
              <div className="empty-column-dropzone">
                <span>Buraya widget taşıyın</span>
              </div>
            )}
          </div>
        )
      })}

      {/* Floating Drag Ghost Preview Following Cursor */}
      {dragState && dragState.isDraggingActive && (
        <div
          className="widget-floating-ghost"
          style={{
            transform: `translate3d(${dragState.currentX - 100}px, ${dragState.currentY - 25}px, 0)`,
          }}
        >
          <GripHorizontal size={14} />
          <span>Widget Taşınıyor</span>
        </div>
      )}
    </div>
  )
}
