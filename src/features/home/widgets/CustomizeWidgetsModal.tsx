import React from 'react'
import Bookmark from 'lucide-react/dist/esm/icons/bookmark.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import CheckSquare from 'lucide-react/dist/esm/icons/check-square.js'
import Eye from 'lucide-react/dist/esm/icons/eye.js'
import EyeOff from 'lucide-react/dist/esm/icons/eye-off.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import History from 'lucide-react/dist/esm/icons/history.js'
import LayoutGrid from 'lucide-react/dist/esm/icons/layout-grid.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import Quote from 'lucide-react/dist/esm/icons/quote.js'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import {
  AVAILABLE_WIDGETS,
  type WidgetId,
  type WidgetLayoutState,
} from './widgetRegistry'

interface CustomizeWidgetsModalProps {
  isOpen: boolean
  onClose: () => void
  layout: WidgetLayoutState
  onToggleWidget: (id: WidgetId) => void
  onResetLayout: () => void
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Bookmark,
  FileText,
  LayoutGrid,
  Quote,
  History,
  CheckSquare,
  Power,
  Smartphone,
}

export function CustomizeWidgetsModal({
  isOpen,
  onClose,
  layout,
  onToggleWidget,
  onResetLayout,
}: CustomizeWidgetsModalProps) {
  if (!isOpen) return null

  const allWidgets = Object.values(AVAILABLE_WIDGETS)
  const hiddenSet = new Set(layout.hiddenWidgets)

  return (
    <div className="custom-widget-overlay" onClick={onClose}>
      <div
        className="custom-widget-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="custom-modal-header">
          <div className="custom-modal-title-group">
            <div className="custom-modal-icon-badge">
              <Sparkles size={16} className="text-sky-500" />
            </div>
            <div>
              <h2 className="custom-modal-title">Anasayfa Widgetlarını Özelleştir</h2>
              <p className="custom-modal-subtitle">
                İstediğiniz widget'ları açıp kapatabilir, anasayfada serbestçe sürükleyebilirsiniz.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="custom-modal-close-btn"
            onClick={onClose}
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* Widget Grid List */}
        <div className="custom-widgets-list">
          {allWidgets.map((meta) => {
            const isVisible = !hiddenSet.has(meta.id)
            const IconComponent = ICON_MAP[meta.iconName] || Sparkles

            return (
              <div
                key={meta.id}
                className={`custom-widget-card-item ${isVisible ? 'custom-widget-card-item--active' : 'custom-widget-card-item--inactive'}`}
                onClick={() => onToggleWidget(meta.id)}
              >
                <div className="custom-widget-item-left">
                  <div
                    className={`custom-widget-item-icon ${isVisible ? 'custom-widget-item-icon--active' : ''}`}
                  >
                    <IconComponent size={18} />
                  </div>
                  <div className="custom-widget-item-info">
                    <span className="custom-widget-item-title">{meta.title}</span>
                    <span className="custom-widget-item-desc">{meta.description}</span>
                  </div>
                </div>

                <div className="custom-widget-toggle-action">
                  {isVisible ? (
                    <div className="custom-badge-on">
                      <Eye size={13} />
                      <span>Aktif</span>
                    </div>
                  ) : (
                    <div className="custom-badge-off">
                      <EyeOff size={13} />
                      <span>Gizli</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Actions */}
        <div className="custom-modal-footer">
          <button
            type="button"
            className="custom-btn-secondary"
            onClick={() => {
              if (window.confirm('Tüm widget yerleşimini ve görünürlüğünü varsayılana sıfırlamak istiyor musunuz?')) {
                onResetLayout()
              }
            }}
          >
            <RotateCcw size={14} />
            <span>Varsayılana Sıfırla</span>
          </button>

          <button type="button" className="custom-btn-primary" onClick={onClose}>
            <Check size={14} />
            <span>Tamam</span>
          </button>
        </div>
      </div>
    </div>
  )
}
