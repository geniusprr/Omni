export const SUPPORTED_LOCALES = [
  'tr',
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'ru',
  'ar',
  'zh',
  'ja',
  'ko',
] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export type TranslationValues = Record<string, string | number>

export interface LanguageOption {
  code: AppLocale
  localeTag: string
  label: string
  nativeName: string
  dir: 'ltr' | 'rtl'
}

export type TranslationRow = readonly [
  en: string,
  de: string,
  fr: string,
  es: string,
  it: string,
  pt: string,
  ru: string,
  ar: string,
  zh: string,
  ja: string,
  ko: string,
]

