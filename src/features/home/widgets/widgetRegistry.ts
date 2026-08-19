export type WidgetId =
  | 'bookmarks'
  | 'notes'
  | 'quickAccess'
  | 'quote'
  | 'todos'
  | 'recentlyClosed'
  | 'powerWidget'
  | 'devices'
  | 'weather'

export interface WidgetMeta {
  id: WidgetId
  title: string
  description: string
  iconName: string
  defaultColumn: number // 0: col1, 1: col2, 2: col3
  defaultOrder: number
}

export const AVAILABLE_WIDGETS: Record<WidgetId, WidgetMeta> = {
  bookmarks: {
    id: 'bookmarks',
    title: 'Yer İmleri',
    description: 'Sık kullanılan web siteleri ve hızlı bağlantılar',
    iconName: 'Bookmark',
    defaultColumn: 0,
    defaultOrder: 0,
  },
  notes: {
    id: 'notes',
    title: 'Hızlı Notlar',
    description: 'En son not veya yapışkan not önizlemesi',
    iconName: 'FileText',
    defaultColumn: 0,
    defaultOrder: 1,
  },
  devices: {
    id: 'devices',
    title: 'Cihazlar & Bağlantılar',
    description: 'Bağlı mobil kontrolcüler, telefonlar ve eşleşmeler',
    iconName: 'Smartphone',
    defaultColumn: 0,
    defaultOrder: 2,
  },
  quickAccess: {
    id: 'quickAccess',
    title: 'Hızlı Erişim',
    description: 'En çok açılan uygulamalar ve servisler',
    iconName: 'LayoutGrid',
    defaultColumn: 1,
    defaultOrder: 0,
  },
  quote: {
    id: 'quote',
    title: 'Günün Sözü',
    description: 'İlham verici günlük alıntılar ve motivasyon',
    iconName: 'Quote',
    defaultColumn: 1,
    defaultOrder: 1,
  },
  recentlyClosed: {
    id: 'recentlyClosed',
    title: 'Son Kapatılanlar',
    description: 'Son ziyaret edilen sayfalar ve geçmiş',
    iconName: 'History',
    defaultColumn: 1,
    defaultOrder: 2,
  },
  todos: {
    id: 'todos',
    title: 'Görev Listesi',
    description: 'Yapılacaklar listesi ve tamamlama takibi',
    iconName: 'CheckSquare',
    defaultColumn: 2,
    defaultOrder: 0,
  },
  powerWidget: {
    id: 'powerWidget',
    title: 'Güç & Sayaç',
    description: 'Hızlı kapatma, yeniden başlatma ve sayaç durumu',
    iconName: 'Power',
    defaultColumn: 2,
    defaultOrder: 1,
  },
  weather: {
    id: 'weather',
    title: 'Hava Durumu',
    description: 'Canlı konum, hava tahmini ve sıcaklık',
    iconName: 'CloudSun',
    defaultColumn: 2,
    defaultOrder: 2,
  },
}

export interface WidgetLayoutState {
  columns: WidgetId[][]
  hiddenWidgets: WidgetId[]
}

const STORAGE_KEY = 'minios_widget_layout_v2'

export const DEFAULT_LAYOUT: WidgetLayoutState = {
  columns: [
    ['bookmarks', 'notes', 'devices'],
    ['quickAccess', 'quote', 'recentlyClosed'],
    ['todos', 'powerWidget', 'weather'],
  ],
  hiddenWidgets: [],
}

export function loadWidgetLayout(): WidgetLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as WidgetLayoutState
    if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.hiddenWidgets)) {
      return DEFAULT_LAYOUT
    }

    // Ensure all existing widget IDs are accounted for
    const allKnownIds = Object.keys(AVAILABLE_WIDGETS) as WidgetId[]
    const existingInCols = new Set(parsed.columns.flat())
    const existingHidden = new Set(parsed.hiddenWidgets)

    // Add any newly introduced widgets that aren't in columns or hidden
    for (const id of allKnownIds) {
      if (!existingInCols.has(id) && !existingHidden.has(id)) {
        const defaultCol = AVAILABLE_WIDGETS[id].defaultColumn ?? 0
        if (!parsed.columns[defaultCol]) parsed.columns[defaultCol] = []
        parsed.columns[defaultCol].push(id)
      }
    }

    return parsed
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveWidgetLayout(layout: WidgetLayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch (e) {
    console.error('Failed to save widget layout', e)
  }
}
