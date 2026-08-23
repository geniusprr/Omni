export type AppTheme = 'light' | 'obsidian' | 'rose' | 'violet' | 'ocean'

export const DEFAULT_APP_THEME: AppTheme = 'obsidian'

export const APP_THEME_STORAGE_KEY = 'kapanis_app_theme'

export function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light'
    || value === 'obsidian'
    || value === 'rose'
    || value === 'violet'
    || value === 'ocean'
}

export function themeColorScheme(theme: AppTheme): 'light' | 'dark' {
  return theme === 'light' ? 'light' : 'dark'
}
