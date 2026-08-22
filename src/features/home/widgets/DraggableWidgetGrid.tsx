import React, { useEffect, useRef, useState } from 'react'
import AppWindow from 'lucide-react/dist/esm/icons/app-window.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js'
import Cloud from 'lucide-react/dist/esm/icons/cloud.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import EyeOff from 'lucide-react/dist/esm/icons/eye-off.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js'
import GripHorizontal from 'lucide-react/dist/esm/icons/grip-horizontal.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import Link2 from 'lucide-react/dist/esm/icons/link-2.js'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js'
import MonitorUp from 'lucide-react/dist/esm/icons/monitor-up.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import Quote from 'lucide-react/dist/esm/icons/quote.js'
import Radio from 'lucide-react/dist/esm/icons/radio.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Send from 'lucide-react/dist/esm/icons/send.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { MiniOsMode } from '@/components/layout/MiniOsDock'
import {
  faviconForBrowserUrl,
  normalizeBrowserInput,
  requestBrowserNavigation,
  saveShortcuts,
  type BrowserShortcut,
  type BrowserShortcutKind,
} from '@/features/browser/browserData'
import { tabStore } from '@/features/notes/stores/tabStore'
import { desktop, type ProgramCandidate } from '@/lib/desktop'
import { durationLabel, targetLabel } from '@/lib/format'
import type {
  PairedController,
  LocalSendDevice,
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
  favicon: string | null
  fallbackText: string
}

export interface QuickAppItem {
  id: string
  name: string
  kind: BrowserShortcutKind
  target: string
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
  onQuickAccessChange: (items: QuickAppItem[]) => void
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
  localDevices?: LocalSendDevice[]
  onRefreshControllers?: () => void
  onOpenPairingModal?: () => void
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

function normalizeProgramTarget(target: string) {
  return target.trim().replace(/\//g, '\\').toLocaleLowerCase('tr-TR')
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
  onQuickAccessChange,
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
  localDevices = [],
  onRefreshControllers,
  onOpenPairingModal,
}: DraggableWidgetGridProps) {
  // POINTER-BASED DRAG & DROP ENGINE (100% reliable in Electron renderers)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropTargetCol, setDropTargetCol] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const columnsRef = useRef<(HTMLDivElement | null)[]>([])
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const quickAccessDialogRef = useRef<HTMLDialogElement>(null)
  const programIconRequestsRef = useRef(new Set<string>())
  const websiteIconRequestsRef = useRef(new Set<string>())
  const componentMountedRef = useRef(true)

  // Local widget states
  const [showAddTodo, setShowAddTodo] = useState(false)
  const [newTodoText, setNewTodoText] = useState('')
  const [powerAction, setPowerAction] = useState<TimerAction>('shutdown')
  const [quickAccessEditorOpen, setQuickAccessEditorOpen] = useState(false)
  const [shortcutKind, setShortcutKind] = useState<BrowserShortcutKind>('program')
  const [shortcutName, setShortcutName] = useState('')
  const [shortcutTarget, setShortcutTarget] = useState('')
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null)
  const [programCandidates, setProgramCandidates] = useState<ProgramCandidate[]>([])
  const [programSearch, setProgramSearch] = useState('')
  const [programsLoaded, setProgramsLoaded] = useState(false)
  const [programsLoading, setProgramsLoading] = useState(false)
  const [programPickerBusy, setProgramPickerBusy] = useState(false)
  const [programIconByTarget, setProgramIconByTarget] = useState<Record<string, string | null>>({})
  const [websiteIconByUrl, setWebsiteIconByUrl] = useState<Record<string, string | null>>({})
  const [quoteIndex, setQuoteIndex] = useState(() => new Date().getDate() % QUOTES.length)

  const presenceNow = Date.now()
  const controllerPresenceRows = pairedControllers.map((controller) => {
    const local = localDevices.find((device) => device.fingerprint === controller.controllerId)
    return {
      id: controller.id,
      name: controller.controllerName || 'Mobil Cihaz',
      type: controller.controllerType || 'Android',
      localOnline: Boolean(local && presenceNow - local.lastSeen < 45_000),
      cloudOnline: Boolean(controller.lastActiveAt && presenceNow - Date.parse(controller.lastActiveAt) < 60_000),
    }
  })
  const pairedControllerIds = new Set(pairedControllers.map((controller) => controller.controllerId))
  const unpairedLocalDevices = localDevices.filter((device) => !pairedControllerIds.has(device.fingerprint))
  const activeDeviceCount = controllerPresenceRows.length + unpairedLocalDevices.length

  const hiddenSet = new Set(layout.hiddenWidgets)
  const remainingSeconds = timer ? Math.max(0, Math.ceil((timer.targetAt - now) / 1000)) : 0
  const completedCount = todos.filter((t) => t.completed).length
  const addedProgramTargets = new Set(
    quickAccessApps
      .filter((item) => item.kind === 'program')
      .map((item) => normalizeProgramTarget(item.target)),
  )
  const normalizedProgramSearch = programSearch.trim().toLocaleLowerCase('tr-TR')
  const matchingPrograms = programCandidates.filter((program) => {
    if (!normalizedProgramSearch) return true
    return `${program.name} ${program.path}`.toLocaleLowerCase('tr-TR').includes(normalizedProgramSearch)
  })
  const visiblePrograms = matchingPrograms.slice(0, 80)
  const programIconPaths = [
    ...quickAccessApps.filter((item) => item.kind === 'program').map((item) => item.target),
    ...visiblePrograms.map((program) => program.path),
  ]
  const programIconTargetKey = [...new Set(programIconPaths.map(normalizeProgramTarget))].sort().join('\u0001')
  const websiteIconUrls = [...new Set(
    quickAccessApps
      .filter((item) => item.kind === 'website')
      .map((item) => normalizeBrowserInput(item.target)),
  )]
  const websiteIconTargetKey = [...websiteIconUrls].sort().join('\u0001')

  function programIconFor(target: string) {
    return programIconByTarget[normalizeProgramTarget(target)] ?? null
  }

  function handleOpenUrl(url: string) {
    requestBrowserNavigation(url)
    onNavigate('browser')
  }

  function persistQuickAccess(items: QuickAppItem[]) {
    onQuickAccessChange(items)
    saveShortcuts(items.map((item): BrowserShortcut => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      target: item.target,
      color: item.bg,
      iconText: item.iconText,
    })))
  }

  function openQuickAccessEditor(kind: BrowserShortcutKind = 'program') {
    setShortcutKind(kind)
    setShortcutError(null)
    setShortcutNotice(null)
    setQuickAccessEditorOpen(true)
  }

  function closeQuickAccessEditor() {
    const dialog = quickAccessDialogRef.current
    if (dialog?.open) dialog.close()
    setQuickAccessEditorOpen(false)
    setShortcutError(null)
    setShortcutNotice(null)
  }

  function changeShortcutKind(kind: BrowserShortcutKind) {
    setShortcutKind(kind)
    setShortcutError(null)
    setShortcutNotice(null)
  }

  async function loadPrograms(refresh = false) {
    setProgramsLoading(true)
    setShortcutError(null)
    try {
      setProgramCandidates(await desktop.programs.list(refresh))
      setProgramsLoaded(true)
    } catch (cause) {
      setShortcutError(cause instanceof Error ? cause.message : 'Program listesi alınamadı.')
    } finally {
      setProgramsLoading(false)
    }
  }

  function addProgramShortcut(program: ProgramCandidate) {
    if (addedProgramTargets.has(normalizeProgramTarget(program.path))) {
      setShortcutNotice(null)
      setShortcutError(`${program.name} zaten hızlı erişimde.`)
      return
    }
    const next = [...quickAccessApps, {
      id: crypto.randomUUID(),
      name: program.name,
      kind: 'program' as const,
      target: program.path,
      bg: 'var(--color-program)',
      iconText: program.name.slice(0, 2).toUpperCase(),
    }].slice(-11)
    persistQuickAccess(next)
    setShortcutError(null)
    setShortcutNotice(`${program.name} hızlı erişime eklendi.`)
  }

  async function handleProgramFilePick() {
    setProgramPickerBusy(true)
    setShortcutError(null)
    try {
      const program = await desktop.programs.pick()
      if (program) addProgramShortcut(program)
    } catch (cause) {
      setShortcutNotice(null)
      setShortcutError(cause instanceof Error ? cause.message : 'Program seçilemedi.')
    } finally {
      setProgramPickerBusy(false)
    }
  }

  function handleShortcutSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (shortcutKind !== 'website') return
    const name = shortcutName.trim()
    const target = normalizeBrowserInput(shortcutTarget)
    if (!name || !target) return
    const next = [...quickAccessApps, {
      id: crypto.randomUUID(),
      name,
      kind: 'website' as const,
      target,
      bg: 'var(--color-browser-blue)',
      iconText: name.slice(0, 2).toUpperCase(),
    }].slice(-11)
    persistQuickAccess(next)
    setShortcutName('')
    setShortcutTarget('')
    setShortcutError(null)
    setShortcutNotice(`${name} hızlı erişime eklendi.`)
  }

  function openShortcut(item: QuickAppItem) {
    if (item.kind === 'program') {
      void desktop.programs.launch(item.target).catch((cause) => {
        openQuickAccessEditor('program')
        setShortcutError(cause instanceof Error ? cause.message : 'Program başlatılamadı.')
      })
      return
    }
    handleOpenUrl(item.target)
  }

  useEffect(() => {
    const dialog = quickAccessDialogRef.current
    if (!dialog) return
    if (quickAccessEditorOpen && !dialog.open) dialog.showModal()
    if (!quickAccessEditorOpen && dialog.open) dialog.close()
  }, [quickAccessEditorOpen])

  useEffect(() => {
    componentMountedRef.current = true
    return () => { componentMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!quickAccessEditorOpen || shortcutKind !== 'program' || programsLoaded) return
    void loadPrograms()
  }, [quickAccessEditorOpen, shortcutKind, programsLoaded])

  useEffect(() => {
    if (!desktop.isElectron() || !programIconTargetKey) return

    const pathsByKey = new Map<string, string>()
    for (const target of programIconPaths) {
      pathsByKey.set(normalizeProgramTarget(target), target)
    }
    const missing = [...pathsByKey].filter(([key]) => (
      !Object.prototype.hasOwnProperty.call(programIconByTarget, key)
      && !programIconRequestsRef.current.has(key)
    ))
    if (missing.length === 0) return

    for (const [key] of missing) programIconRequestsRef.current.add(key)
    void Promise.all(missing.map(async ([key, target]) => {
      try {
        return [key, await desktop.programs.icon(target)] as const
      } catch {
        return [key, null] as const
      }
    })).then((icons) => {
      if (!componentMountedRef.current) return
      setProgramIconByTarget((current) => {
        const next = { ...current }
        for (const [key, icon] of icons) next[key] = icon
        return next
      })
    }).finally(() => {
      for (const [key] of missing) programIconRequestsRef.current.delete(key)
    })
  }, [programIconByTarget, programIconTargetKey])

  useEffect(() => {
    if (!desktop.isElectron() || !websiteIconTargetKey) return

    const missing = websiteIconUrls.filter((url) => (
      !Object.prototype.hasOwnProperty.call(websiteIconByUrl, url)
      && !websiteIconRequestsRef.current.has(url)
    ))
    if (missing.length === 0) return

    for (const url of missing) websiteIconRequestsRef.current.add(url)
    void Promise.all(missing.map(async (url) => {
      try {
        return [url, await desktop.websiteIcons.get(url)] as const
      } catch {
        return [url, null] as const
      }
    })).then((icons) => {
      if (!componentMountedRef.current) return
      setWebsiteIconByUrl((current) => {
        const next = { ...current }
        for (const [url, icon] of icons) next[url] = icon
        return next
      })
    }).finally(() => {
      for (const url of missing) websiteIconRequestsRef.current.delete(url)
    })
  }, [websiteIconByUrl, websiteIconTargetKey])

  function handleQuickAccessDialogClose() {
    setQuickAccessEditorOpen(false)
    setShortcutError(null)
    setShortcutNotice(null)
  }

  function handleQuickAccessDialogBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const clickedBackdrop = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom
    if (clickedBackdrop) closeQuickAccessEditor()
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
                  onClick={() => onNavigate('browser')}
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
                <button
                  type="button"
                  key={bm.name}
                  className="bookmark-item-row"
                  onClick={() => handleOpenUrl(bm.url)}
                >
                  <div className="bm-icon-circle" style={{ backgroundColor: bm.bg }}>
                    <BookmarkIcon src={bm.favicon} fallbackText={bm.fallbackText} />
                  </div>
                  <span className="bm-site-name">{bm.name}</span>
                  <span className="bm-site-domain">{bm.domain}</span>
                  <ChevronRight size={12} className="bm-chevron" />
                </button>
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
                  onClick={() => openQuickAccessEditor()}
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
              {quickAccessApps.map((app) => {
                const icon = shortcutIconFor(app, programIconByTarget, websiteIconByUrl)
                return (
                  <button
                    type="button"
                    key={app.id}
                    className={`qa-app-tile${icon ? '' : ' qa-app-tile--iconless'}`}
                    onClick={() => openShortcut(app)}
                    title={app.kind === 'program' ? app.target : undefined}
                  >
                    <ShortcutIcon className="qa-app-squircle" src={icon} />
                    <span className="qa-app-label">{app.name}</span>
                  </button>
                )
              })}

              <button
                type="button"
                className="qa-app-tile qa-app-tile--add"
                onClick={() => openQuickAccessEditor()}
              >
                <div className="qa-app-squircle qa-app-squircle--dashed">
                  <Plus size={14} />
                </div>
                <span className="qa-app-label">Ekle</span>
              </button>
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
                <button type="button" className="card-pill-btn" onClick={() => setQuoteIndex((current) => (current + 1) % QUOTES.length)}>Yenile</button>
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
              {QUOTES[quoteIndex].text}
            </p>
            <span className="quote-author-name">— {QUOTES[quoteIndex].author}</span>
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
                <button
                  type="button"
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
                </button>
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
                  onClick={() => (onOpenPairingModal ? onOpenPairingModal() : onNavigate('settings'))}
                >
                  Eşleştir & QR
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

                <div
                  className="widget-pairing-badge"
                  title="Telefon ile Eşleştir (QR Kod Aç)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => (onOpenPairingModal ? onOpenPairingModal() : onNavigate('settings'))}
                >
                  <QrCode size={11} className="text-sky-400" />
                  <span className="font-mono font-bold text-sky-400">{pairingCode}</span>
                </div>
              </div>

              {/* Paired Remote Controllers List */}
                <div className="widget-controllers-section">
                  <div className="widget-controllers-header">
                    <span>Aktif Cihazlar</span>
                    <span className="widget-controllers-count">{activeDeviceCount}</span>
                  </div>

                {activeDeviceCount > 0 ? (
                  <div className="widget-controllers-list">
                    {controllerPresenceRows.map((ctrl) => (
                      <div key={ctrl.id} className="widget-controller-row widget-controller-row--presence">
                        <div className="widget-ctrl-icon">
                          <Smartphone size={12} className="text-slate-400" />
                        </div>
                        <div className="widget-ctrl-info">
                          <span className="widget-ctrl-name">{ctrl.name}</span>
                          <span className="widget-ctrl-type">{ctrl.type}</span>
                        </div>
                        <div className="widget-presence-badges" title="Bağlantı kanalları">
                          {ctrl.localOnline ? <span className="widget-presence-badge widget-presence-badge--local"><Wifi size={10} /> Yerel</span> : null}
                          {ctrl.cloudOnline ? <span className="widget-presence-badge widget-presence-badge--cloud"><Cloud size={10} /> Bulut</span> : null}
                          {!ctrl.localOnline && !ctrl.cloudOnline ? <span className="widget-presence-badge widget-presence-badge--offline">Bekliyor</span> : null}
                        </div>
                      </div>
                    ))}
                    {unpairedLocalDevices.map((device) => {
                      const isOnline = presenceNow - device.lastSeen < 45_000
                      return (
                        <div key={`local-${device.ip}-${device.port}`} className="widget-controller-row widget-controller-row--presence">
                          <div className="widget-ctrl-icon"><Smartphone size={12} className="text-slate-400" /></div>
                          <div className="widget-ctrl-info">
                            <span className="widget-ctrl-name">{device.alias || 'Yerel Telefon'}</span>
                            <span className="widget-ctrl-type">Wi-Fi</span>
                          </div>
                          <div className="widget-presence-badges">
                            <span className={`widget-presence-badge ${isOnline ? 'widget-presence-badge--local' : 'widget-presence-badge--offline'}`}>
                              <Wifi size={10} /> {isOnline ? 'Yerel' : 'Bekliyor'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="widget-no-controllers">
                    <span>Bağlı telefon yok.</span>
                    <button
                      type="button"
                      className="widget-mini-link-btn"
                      onClick={() => (onOpenPairingModal ? onOpenPairingModal() : onNavigate('settings'))}
                    >
                      + QR ile Eşle
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Actions Footer */}
              <div className="widget-device-quick-actions">
                <button
                  type="button"
                  className="widget-device-action-pill"
                  onClick={() => (onOpenPairingModal ? onOpenPairingModal() : onNavigate('settings'))}
                >
                  <QrCode size={11} />
                  <span>QR / Kumanda</span>
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

      <dialog
        ref={quickAccessDialogRef}
        className="quick-access-editor"
        aria-labelledby="quick-access-editor-title"
        onCancel={(event) => {
          event.preventDefault()
          closeQuickAccessEditor()
        }}
        onClose={handleQuickAccessDialogClose}
        onClick={handleQuickAccessDialogBackdrop}
      >
        <form className="quick-access-editor__content" onSubmit={handleShortcutSubmit}>
          <div className="quick-access-editor__head">
            <div>
              <h2 id="quick-access-editor-title">Hızlı erişime ekle</h2>
              <p>{shortcutKind === 'program'
                ? 'Bilgisayarındaki uygulamayı seç; kısayol otomatik eklenir.'
                : 'Tarayıcıda açmak istediğin web sitesini ekle.'}</p>
            </div>
            <button type="button" className="quick-access-editor__close" onClick={closeQuickAccessEditor} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>

          <div className="quick-access-editor__type" role="tablist" aria-label="Kısayol türü">
            <button
              type="button"
              role="tab"
              aria-selected={shortcutKind === 'program'}
              className={shortcutKind === 'program' ? 'is-active' : ''}
              onClick={() => changeShortcutKind('program')}
            >
              <MonitorUp size={15} /> Program
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={shortcutKind === 'website'}
              className={shortcutKind === 'website' ? 'is-active' : ''}
              onClick={() => changeShortcutKind('website')}
            >
              <Link2 size={15} /> Web sitesi
            </button>
          </div>

          <div className="quick-access-editor__body">
            {shortcutKind === 'program' ? (
              <section className="quick-access-program-picker" aria-labelledby="quick-access-program-picker-title">
                <div className="quick-access-program-picker__search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    autoFocus
                    value={programSearch}
                    onChange={(event) => setProgramSearch(event.target.value)}
                    placeholder="Programlarda ara"
                    aria-label="Programlarda ara"
                  />
                </div>

                <div className="quick-access-program-picker__meta">
                  <p id="quick-access-program-picker-title" aria-live="polite">
                    {programsLoading
                      ? 'Programlar aranıyor…'
                      : matchingPrograms.length === 0
                        ? 'Program bulunamadı'
                        : `${matchingPrograms.length} program bulundu`}
                  </p>
                  <button
                    type="button"
                    className="quick-access-program-picker__refresh"
                    onClick={() => void loadPrograms(true)}
                    disabled={programsLoading || !desktop.isElectron()}
                    aria-label="Program listesini yenile"
                    title="Listeyi yenile"
                  >
                    <RefreshCw size={14} className={programsLoading ? 'is-spinning' : undefined} />
                  </button>
                </div>

                <div className="quick-access-program-picker__list" aria-busy={programsLoading}>
                  {programsLoading ? (
                    <div className="quick-access-program-picker__empty" role="status">
                      <LoaderCircle size={18} className="is-spinning" aria-hidden="true" />
                      <p>Yüklü uygulamalar hazırlanıyor.</p>
                    </div>
                  ) : visiblePrograms.length > 0 ? (
                    visiblePrograms.map((program) => {
                      const alreadyAdded = addedProgramTargets.has(normalizeProgramTarget(program.path))
                      const icon = programIconFor(program.path)
                      return (
                        <button
                          key={`${program.source}:${program.path}`}
                          type="button"
                          className={`quick-access-program-picker__item${icon ? '' : ' is-iconless'}`}
                          data-state={alreadyAdded ? 'success' : undefined}
                          disabled={alreadyAdded}
                          onClick={() => addProgramShortcut(program)}
                          title={program.path}
                          aria-label={alreadyAdded ? `${program.name} zaten hızlı erişimde` : `${program.name} ekle`}
                        >
                          <ShortcutIcon className="quick-access-program-picker__icon" src={icon} />
                          <span className="quick-access-program-picker__details">
                            <strong>{program.name}</strong>
                            <small>{programSourceLabel(program.source)}</small>
                          </span>
                          {alreadyAdded ? <CircleCheck size={17} aria-label="Eklendi" /> : <Plus size={17} aria-hidden="true" />}
                        </button>
                      )
                    })
                  ) : (
                    <div className="quick-access-program-picker__empty">
                      <AppWindow size={20} aria-hidden="true" />
                      <strong>{desktop.isElectron() ? 'Aramana uyan program yok.' : 'Program listesi masaüstü uygulamasında görünür.'}</strong>
                      <p>Listede yoksa aşağıdan kendin seçebilirsin.</p>
                    </div>
                  )}
                </div>

                {matchingPrograms.length > visiblePrograms.length ? (
                  <p className="quick-access-program-picker__limit">İlk 80 sonuç gösteriliyor. Aramayla daraltabilirsin.</p>
                ) : null}

                <div className="quick-access-program-picker__fallback">
                  <div>
                    <strong>Listede yok mu?</strong>
                    <p>Program dosyasını kendin seç.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleProgramFilePick()}
                    disabled={programPickerBusy || !desktop.isElectron()}
                  >
                    {programPickerBusy ? <LoaderCircle size={15} className="is-spinning" aria-hidden="true" /> : <FolderOpen size={15} aria-hidden="true" />}
                    {programPickerBusy ? 'Seçiliyor' : 'Dosyadan seç'}
                  </button>
                </div>
              </section>
            ) : (
              <section className="quick-access-editor__website-fields" aria-label="Web sitesi ekle">
                <label>
                  Ad
                  <input
                    autoFocus
                    value={shortcutName}
                    onChange={(event) => setShortcutName(event.target.value)}
                    placeholder="GitHub"
                    required
                  />
                </label>
                <label>
                  Web adresi
                  <input
                    value={shortcutTarget}
                    onChange={(event) => setShortcutTarget(event.target.value)}
                    placeholder="github.com"
                    required
                  />
                </label>
              </section>
            )}
          </div>

          {shortcutError ? <p className="quick-access-editor__error" role="alert">{shortcutError}</p> : null}
          {shortcutNotice ? <p className="quick-access-editor__notice" role="status">{shortcutNotice}</p> : null}

          <section className="quick-access-editor__saved" aria-labelledby="quick-access-saved-title">
            <div className="quick-access-editor__section-head">
              <h3 id="quick-access-saved-title">Ekli kısayollar</h3>
              <span>{quickAccessApps.length}/11</span>
            </div>
            <div className="quick-access-editor__list">
              {quickAccessApps.map((item) => {
                const icon = shortcutIconFor(item, programIconByTarget, websiteIconByUrl)
                return (
                  <div key={item.id} className={icon ? '' : 'is-iconless'}>
                    <ShortcutIcon className="quick-access-editor__item-icon" src={icon} />
                    <span className="quick-access-editor__item-details"><strong>{item.name}</strong><small>{item.target}</small></span>
                    <button type="button" onClick={() => persistQuickAccess(quickAccessApps.filter((entry) => entry.id !== item.id))} aria-label={`${item.name} kısayolunu sil`}><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="quick-access-editor__actions">
            <button type="button" onClick={closeQuickAccessEditor}>Kapat</button>
            {shortcutKind === 'website' ? <button type="submit" className="is-primary">Web sitesi ekle</button> : null}
          </div>
        </form>
      </dialog>
    </div>
  )
}

function programSourceLabel(source: ProgramCandidate['source']) {
  if (source === 'start-menu') return 'Başlat menüsü'
  if (source === 'app-paths') return 'Yüklü uygulama'
  return 'Dosyadan seçildi'
}

function shortcutIconFor(
  item: Pick<QuickAppItem, 'kind' | 'target'>,
  programIcons: Record<string, string | null>,
  websiteIcons: Record<string, string | null>,
) {
  if (item.kind === 'program') return programIcons[normalizeProgramTarget(item.target)] ?? null
  const url = normalizeBrowserInput(item.target)
  return websiteIcons[url] ?? faviconForBrowserUrl(url)
}

function ShortcutIcon({ className, src }: { className: string; src: string | null }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (!src || failedSource === src) return null
  return (
    <span className={className} aria-hidden="true">
      <img src={src} alt="" draggable={false} decoding="async" onError={() => setFailedSource(src)} />
    </span>
  )
}

function BookmarkIcon({ src, fallbackText }: { src: string | null; fallbackText: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)

  if (src && failedSource !== src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        onError={() => setFailedSource(src)}
      />
    )
  }

  return <span>{fallbackText}</span>
}

const QUOTES = [
  { text: 'Geleceği tahmin etmenin en iyi yolu, onu yaratmaktır.', author: 'Peter Drucker' },
  { text: 'İyi tasarım, mümkün olduğunca az tasarımdır.', author: 'Dieter Rams' },
  { text: 'Basitlik, ulaşılmış nihai karmaşıklıktır.', author: 'Leonardo da Vinci' },
  { text: 'Başlamak için mükemmel olmak zorunda değilsin.', author: 'Zig Ziglar' },
]
