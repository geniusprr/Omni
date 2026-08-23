import { useSyncExternalStore } from 'react'
import { UI_TRANSLATIONS } from './catalog'
import { HOME_TRANSLATIONS } from './catalogs/home'
import { BROWSER_TRANSLATIONS } from './catalogs/browser'
import { POWER_TRANSLATIONS } from './catalogs/power'
import { SHELL_TRANSLATIONS } from './catalogs/shell'
import { TRANSFER_TRANSLATIONS } from './catalogs/transfer'
import { SUPPORTED_LOCALES, type AppLocale, type LanguageOption, type TranslationValues } from './types'

export type { AppLocale, LanguageOption, TranslationValues } from './types'
export { SUPPORTED_LOCALES } from './types'

const STORAGE_KEY = 'omni.locale'
const LOCALE_EVENT = 'omni:locale-change'

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'tr', localeTag: 'tr-TR', label: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'en', localeTag: 'en-US', label: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'de', localeTag: 'de-DE', label: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'fr', localeTag: 'fr-FR', label: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'es', localeTag: 'es-ES', label: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'it', localeTag: 'it-IT', label: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'pt', localeTag: 'pt-BR', label: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'ru', localeTag: 'ru-RU', label: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'ar', localeTag: 'ar-SA', label: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'zh', localeTag: 'zh-CN', label: 'Chinese', nativeName: '简体中文', dir: 'ltr' },
  { code: 'ja', localeTag: 'ja-JP', label: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'ko', localeTag: 'ko-KR', label: 'Korean', nativeName: '한국어', dir: 'ltr' },
] as const

const localeIndex: Record<Exclude<AppLocale, 'tr'>, number> = {
  en: 0,
  de: 1,
  fr: 2,
  es: 3,
  it: 4,
  pt: 5,
  ru: 6,
  ar: 7,
  zh: 8,
  ja: 9,
  ko: 10,
}

const TRANSLATIONS: Readonly<Record<string, import('./types').TranslationRow>> = {
  ...UI_TRANSLATIONS,
  ...SHELL_TRANSLATIONS,
  ...HOME_TRANSLATIONS,
  ...BROWSER_TRANSLATIONS,
  ...POWER_TRANSLATIONS,
  ...TRANSFER_TRANSLATIONS,
}

let currentLocale: AppLocale | null = null

function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return Boolean(value && (SUPPORTED_LOCALES as readonly string[]).includes(value))
}

export function detectSystemLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'tr'
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean)
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().replace('_', '-')
    const base = normalized.split('-')[0]
    if (isSupportedLocale(base)) return base
  }
  return 'en'
}

function readStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isSupportedLocale(stored) ? stored : null
  } catch {
    return null
  }
}

export function getLocale(): AppLocale {
  if (!currentLocale) {
    currentLocale = readStoredLocale()
    if (!currentLocale) {
      currentLocale = detectSystemLocale()
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, currentLocale)
        } catch {
          // Keep the detected language for the session when storage is blocked.
        }
      }
    }
  }
  return currentLocale
}

export function getLocaleOption(locale: AppLocale = getLocale()) {
  return LANGUAGE_OPTIONS.find((option) => option.code === locale) || LANGUAGE_OPTIONS[0]
}

export function getLocaleTag(locale: AppLocale = getLocale()) {
  return getLocaleOption(locale).localeTag
}

function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === 'undefined') return
  const option = getLocaleOption(locale)
  document.documentElement.lang = option.localeTag
  document.documentElement.dir = option.dir
  document.documentElement.dataset.locale = locale
}

export function setLocale(locale: AppLocale) {
  if (!isSupportedLocale(locale)) return
  currentLocale = locale
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // A blocked storage area should not prevent language switching for the
      // current session.
    }
  }
  applyDocumentLocale(locale)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: { locale } }))
}

function interpolate(value: string, values?: TranslationValues) {
  if (!values) return value
  return value.replace(/\{([\w.-]+)\}/g, (match, key: string) => {
    const replacement = values[key]
    return replacement === undefined ? match : String(replacement)
  })
}

export function translate(source: string, locale: AppLocale = getLocale(), values?: TranslationValues) {
  if (!source) return source
  if (locale === 'tr') return interpolate(source, values)
  const row = TRANSLATIONS[source]
  const translated = row?.[localeIndex[locale]] || source
  return interpolate(translated, values)
}

export function t(source: string, values?: TranslationValues) {
  return translate(source, getLocale(), values)
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const listener = () => callback()
  const storageListener = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !isSupportedLocale(event.newValue)) return
    currentLocale = event.newValue
    applyDocumentLocale(currentLocale)
    callback()
  }
  window.addEventListener(LOCALE_EVENT, listener)
  window.addEventListener('storage', storageListener)
  return () => {
    window.removeEventListener(LOCALE_EVENT, listener)
    window.removeEventListener('storage', storageListener)
  }
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'tr' as AppLocale)
  const option = getLocaleOption(locale)
  return {
    locale,
    localeTag: option.localeTag,
    dir: option.dir,
    language: option,
    setLocale,
    t: (source: string, values?: TranslationValues) => translate(source, locale, values),
  }
}

type DateValue = Date | number | string

function asDate(value: DateValue) {
  return value instanceof Date ? value : new Date(value)
}

export function formatDate(value: DateValue, options?: Intl.DateTimeFormatOptions, locale = getLocale()) {
  return new Intl.DateTimeFormat(getLocaleTag(locale), options || { dateStyle: 'medium' }).format(asDate(value))
}

export function formatTime(value: DateValue, options?: Intl.DateTimeFormatOptions, locale = getLocale()) {
  return new Intl.DateTimeFormat(getLocaleTag(locale), options || { hour: '2-digit', minute: '2-digit' }).format(asDate(value))
}

export function formatDateTime(value: DateValue, options?: Intl.DateTimeFormatOptions, locale = getLocale()) {
  return new Intl.DateTimeFormat(getLocaleTag(locale), options || { dateStyle: 'medium', timeStyle: 'short' }).format(asDate(value))
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale = getLocale()) {
  return new Intl.NumberFormat(getLocaleTag(locale), options).format(value)
}

const TEXT_SKIP_SELECTOR = [
  '[data-i18n-skip]',
  '[contenteditable="true"]',
  '.cm-editor',
  '.cm-content',
  '.reading-mode',
  '.reading-mode-content',
  '.markdown-preview',
  '.note-content',
  '.sql-code-box',
].join(',')

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'aria-description'] as const
const textState = new WeakMap<Text, { source: string; lastApplied: string }>()
const attributeState = new WeakMap<Element, Map<string, { source: string; lastApplied: string }>>()

function preserveEdgeWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] || ''
  const trailing = source.match(/\s*$/)?.[0] || ''
  return `${leading}${translated}${trailing}`
}

function localizeTextNode(node: Text) {
  const parent = node.parentElement
  if (!parent || parent.closest(TEXT_SKIP_SELECTOR)) return
  const current = node.nodeValue || ''
  if (!current.trim()) return
  let state = textState.get(node)
  if (!state || current !== state.lastApplied) {
    state = { source: current, lastApplied: current }
    textState.set(node, state)
  }
  const sourceTrimmed = state.source.trim()
  const translated = translate(sourceTrimmed)
  const next = preserveEdgeWhitespace(state.source, translated)
  if (current !== next) {
    state.lastApplied = next
    node.nodeValue = next
  } else {
    state.lastApplied = current
  }
}

function localizeElementAttributes(element: Element) {
  if (element.closest(TEXT_SKIP_SELECTOR)) return
  let states = attributeState.get(element)
  if (!states) {
    states = new Map()
    attributeState.set(element, states)
  }
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute)
    if (!current) continue
    const previous = states.get(attribute)
    const source = !previous || current !== previous.lastApplied ? current : previous.source
    const next = translate(source)
    states.set(attribute, { source, lastApplied: next })
    if (current !== next) element.setAttribute(attribute, next)
  }
}

function localizeSubtree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root as Text)
    return
  }
  if (!(root instanceof Element) && !(root instanceof DocumentFragment) && !(root instanceof Document)) return
  if (root instanceof Element) localizeElementAttributes(root)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let current: Node | null = walker.currentNode
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) localizeTextNode(current as Text)
    else if (current instanceof Element) localizeElementAttributes(current)
    current = walker.nextNode()
  }
}

let domObserver: MutationObserver | null = null

export function startDomLocalization() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  applyDocumentLocale(getLocale())
  if (document.body) localizeSubtree(document.body)
  if (!domObserver) {
    domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          localizeTextNode(mutation.target as Text)
          continue
        }
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          localizeElementAttributes(mutation.target)
          continue
        }
        for (const node of mutation.addedNodes) localizeSubtree(node)
      }
    })
    domObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    })
  }
  const relocalize = () => document.body && localizeSubtree(document.body)
  window.addEventListener(LOCALE_EVENT, relocalize)
  return () => window.removeEventListener(LOCALE_EVENT, relocalize)
}
