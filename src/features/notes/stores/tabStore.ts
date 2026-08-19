import { useEffect, useState } from 'react'
import type { NoteTab } from '../types'

interface TabStoreState {
  tabs: NoteTab[]
  activeTabId: string | null
}

let state: TabStoreState = {
  tabs: [],
  activeTabId: null,
}

const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) {
    listener()
  }
}

function updateState(partial: Partial<TabStoreState>) {
  state = { ...state, ...partial }
  notifyListeners()
}

export const tabStore = {
  getState: () => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  openTab(path: string, viewType: 'editor' | 'graph' = 'editor') {
    const existing = state.tabs.find((t) => t.path === path && t.viewType === viewType)
    if (existing) {
      updateState({ activeTabId: existing.id })
      return existing
    }

    const title = path.split('/').pop()?.replace(/\.md$/i, '') || (viewType === 'graph' ? 'İlişki Grafiği' : 'Yeni Not')
    const newTab: NoteTab = {
      id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      path,
      title,
      viewType,
      isDirty: false,
    }

    updateState({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    })
    return newTab
  },

  closeTab(id: string) {
    const tabIndex = state.tabs.findIndex((t) => t.id === id)
    if (tabIndex === -1) return

    const nextTabs = state.tabs.filter((t) => t.id !== id)
    let nextActiveId = state.activeTabId

    if (state.activeTabId === id) {
      if (nextTabs.length > 0) {
        // Activate previous or next tab
        const nextIndex = Math.min(tabIndex, nextTabs.length - 1)
        nextActiveId = nextTabs[nextIndex].id
      } else {
        nextActiveId = null
      }
    }

    updateState({
      tabs: nextTabs,
      activeTabId: nextActiveId,
    })
  },

  closeOtherTabs(id: string) {
    const kept = state.tabs.filter((t) => t.id === id)
    updateState({
      tabs: kept,
      activeTabId: id,
    })
  },

  closeAllTabs() {
    updateState({
      tabs: [],
      activeTabId: null,
    })
  },

  setActiveTab(id: string) {
    if (state.tabs.some((t) => t.id === id)) {
      updateState({ activeTabId: id })
    }
  },

  setTabDirty(id: string, isDirty: boolean) {
    const nextTabs = state.tabs.map((t) => (t.id === id ? { ...t, isDirty } : t))
    updateState({ tabs: nextTabs })
  },

  updateTabPath(oldPath: string, newPath: string) {
    const newTitle = newPath.split('/').pop()?.replace(/\.md$/i, '') || 'Not'
    const nextTabs = state.tabs.map((t) =>
      t.path === oldPath ? { ...t, path: newPath, title: newTitle } : t,
    )
    updateState({ tabs: nextTabs })
  },

  getActiveTab(): NoteTab | null {
    return state.tabs.find((t) => t.id === state.activeTabId) || null
  },
}

export function useTabs() {
  const [store, setStore] = useState(tabStore.getState())

  useEffect(() => {
    const unsubscribe = tabStore.subscribe(() => {
      setStore(tabStore.getState())
    })
    return unsubscribe
  }, [])

  return store
}
