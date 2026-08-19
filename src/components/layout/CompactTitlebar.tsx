import Minus from 'lucide-react/dist/esm/icons/minus.js'
import Square from 'lucide-react/dist/esm/icons/square.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desktop } from '@/lib/desktop'

export function CompactTitlebar() {
  return (
    <header className="compact-titlebar" data-tauri-drag-region>
      <div className="compact-titlebar__brand" data-tauri-drag-region>
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span className="brand-title">kapanış.</span>
      </div>
      <div className="compact-titlebar__spacer" data-tauri-drag-region />
      <TooltipProvider delayDuration={700}>
        <div className="compact-titlebar__controls">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Küçült"
                className="titlebar-button titlebar-button--minimize"
                onClick={() => void desktop.window.minimize()}
              >
                <Minus aria-hidden="true" size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Küçült</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Ekranı Kapla / Geri Yükle"
                className="titlebar-button titlebar-button--maximize"
                onClick={() => void desktop.window.toggleMaximize()}
              >
                <Square aria-hidden="true" size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Büyüt / Geri Yükle</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Sistem tepsisine küçült"
                className="titlebar-button titlebar-button--close"
                onClick={() => void desktop.window.close()}
              >
                <X aria-hidden="true" size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Tepsiye küçült</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  )
}
