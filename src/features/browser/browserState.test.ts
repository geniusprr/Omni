import assert from 'node:assert/strict'
import { applyTabProjectionState, canStartNativeRestore, closeOtherTabsState, closeTabsToTheRightState, closeTabState, DEFAULT_BROWSER_HOME_URL, EMPTY_BROWSER_STATE, lastPlayingMedia, makeTab, migrateBrowserState, nativeNavigationAction, nativeRestoreTasks, nativeViewAction, openTabState, prepareNewTabNavigation, reorderTabState, resolveOptimisticClose, serializeBrowserState, validateTabId, type BrowserState } from './browserState'
import { faviconForBrowserUrl } from './browserData'

const tabs = ['a', 'b', 'c'].map((id) => ({ id, url: `https://${id}.example`, title: id, favicon: null, loading: false, canGoBack: false, canGoForward: false, error: null }))
let state: BrowserState = { ...EMPTY_BROWSER_STATE, tabs, activeTabId: 'b', mediaByTabId: { b: { tabId: 'b', playing: true, lastPlayingAt: 2 }, a: { tabId: 'a', playing: true, lastPlayingAt: 1 } } }
state = closeTabState(state, 'b')
assert.equal(state.activeTabId, 'c')
assert.equal(lastPlayingMedia(state.mediaByTabId)?.tabId, 'a')
assert.equal(closeTabState(state, 'missing'), state)
assert.equal(closeTabState({ ...state, tabs: [tabs[0]], activeTabId: 'a' }, 'a').activeTabId, null)
assert.ok(validateTabId('tab_1')); assert.ok(!validateTabId('../unsafe'))
const migrated = migrateBrowserState([{ id: 'good', url: 'https://example.com', title: '' }, { id: '../bad', url: 'https://bad.example', title: 'bad' }, { id: 'alsoBad', url: 'file:///unsafe', title: 'bad' }], 'good')
assert.equal(migrated.tabs.length, 1)
assert.equal(migrated.tabs[0].favicon, 'https://example.com/favicon.ico')
assert.equal(serializeBrowserState(closeTabState(migrated, 'good')).activeTabId, null)
const optimistic = closeTabState({ ...EMPTY_BROWSER_STATE, tabs: [tabs[0]], activeTabId: 'a', mediaByTabId: {} }, 'a')
assert.equal(resolveOptimisticClose({ ...EMPTY_BROWSER_STATE, tabs: [tabs[0]], activeTabId: 'a', mediaByTabId: {} }, optimistic, false).tabs[0].id, 'a')
const stablePlaying = { a: { tabId: 'a', playing: true, lastPlayingAt: 10 }, b: { tabId: 'b', playing: true, lastPlayingAt: 20 } }
assert.equal(lastPlayingMedia(stablePlaying)?.tabId, 'b')
assert.equal(lastPlayingMedia({ ...stablePlaying, a: { ...stablePlaying.a, title: 'poll update' } })?.tabId, 'b')
assert.equal(lastPlayingMedia({ ...stablePlaying, b: { ...stablePlaying.b, playing: false } })?.tabId, 'a')
const opened = openTabState(EMPTY_BROWSER_STATE, tabs[0])
assert.equal(opened.tabs.length, 1)
assert.equal(opened.activeTabId, 'a')
assert.equal(opened.tabs[0].url, 'https://a.example')
const legacyBlankTab = { ...tabs[0], id: 'blank', url: null, title: 'Yeni Sekme' }
const migratedBlank = migrateBrowserState([legacyBlankTab], 'blank')
assert.equal(migratedBlank.tabs[0].url, DEFAULT_BROWSER_HOME_URL)
assert.deepEqual(nativeViewAction(migratedBlank), { type: 'activate', tabId: 'blank' })
assert.deepEqual(nativeRestoreTasks(migratedBlank), [{ tabId: 'blank', url: DEFAULT_BROWSER_HOME_URL }])
assert.equal(makeTab().url, DEFAULT_BROWSER_HOME_URL)
assert.equal(nativeNavigationAction(tabs[0], false), 'create')
assert.equal(nativeNavigationAction(tabs[0], true), 'navigate')
assert.equal(canStartNativeRestore(false, true, false), false)
assert.equal(canStartNativeRestore(true, false, false), false)
assert.equal(canStartNativeRestore(true, true, false), true)
assert.equal(canStartNativeRestore(true, true, true), false)
const prepared = prepareNewTabNavigation(EMPTY_BROWSER_STATE, tabs[0], 'https://example.com')
assert.equal(prepared.state.tabs.length, 1)
assert.equal(prepared.tabId, 'a')
assert.equal(prepared.url, 'https://example.com')
const nativeCreated = applyTabProjectionState(prepared.state, { id: 'a', url: 'https://example.com', title: 'Example Domain', favicon: 'https://example.com/favicon.ico', loading: true, canGoBack: false, canGoForward: false, error: null, label: 'browser-a' })
assert.equal(nativeCreated.tabs.length, 1)
assert.equal(nativeCreated.tabs[0].url, 'https://example.com')
assert.equal(nativeCreated.tabs[0].title, 'Example Domain')
assert.equal(faviconForBrowserUrl('https://example.com/path'), 'https://example.com/favicon.ico')
assert.equal(faviconForBrowserUrl('file:///nope'), null)

// Incognito tests
const incognitoTab = makeTab(null, true)
assert.equal(incognitoTab.incognito, true)
assert.equal(incognitoTab.url, DEFAULT_BROWSER_HOME_URL)
const stateWithIncognito = openTabState({ ...EMPTY_BROWSER_STATE, tabs: [tabs[0]] }, incognitoTab)
assert.equal(serializeBrowserState(stateWithIncognito).tabs.length, 1)
assert.equal(nativeRestoreTasks(stateWithIncognito).length, 1)

// Close other & right tests
const multiState: BrowserState = {
  tabs: [
    { id: 't1', url: 'https://1.example', title: '1', favicon: null, loading: false, canGoBack: false, canGoForward: false, error: null, pinned: true },
    { id: 't2', url: 'https://2.example', title: '2', favicon: null, loading: false, canGoBack: false, canGoForward: false, error: null },
    { id: 't3', url: 'https://3.example', title: '3', favicon: null, loading: false, canGoBack: false, canGoForward: false, error: null },
    { id: 't4', url: 'https://4.example', title: '4', favicon: null, loading: false, canGoBack: false, canGoForward: false, error: null },
  ],
  activeTabId: 't3',
  mediaByTabId: {},
}
const closedOthers = closeOtherTabsState(multiState, 't3')
assert.deepEqual(closedOthers.tabs.map(t => t.id), ['t1', 't3'])
const closedRight = closeTabsToTheRightState(multiState, 't2')
assert.deepEqual(closedRight.tabs.map(t => t.id), ['t1', 't2'])
const reorderedRight = reorderTabState(multiState, 't2', 't3', 'after')
assert.deepEqual(reorderedRight.tabs.map(t => t.id), ['t1', 't3', 't2', 't4'])
const reorderedLeft = reorderTabState(reorderedRight, 't2', 't3', 'before')
assert.deepEqual(reorderedLeft.tabs.map(t => t.id), ['t1', 't2', 't3', 't4'])
assert.equal(reorderTabState(multiState, 't1', 't2', 'after'), multiState)

for (let index = 0; index < 30; index += 1) state = closeTabState({ ...EMPTY_BROWSER_STATE, tabs: [tabs[0]], activeTabId: 'a', mediaByTabId: { a: { tabId: 'a', playing: true, lastPlayingAt: index } } }, 'a')
assert.deepEqual(state, EMPTY_BROWSER_STATE)
console.log('browser lifecycle state tests passed')
