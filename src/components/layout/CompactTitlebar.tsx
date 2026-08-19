import Minus from 'lucide-react/dist/esm/icons/minus.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desktop } from '@/lib/desktop'

export function CompactTitlebar() {
  return (
    <header className="compact-titlebar" data-tauri-drag-region>
      <div className="compact-titlebar__brand" data-tauri-drag-region>
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>kapanış.</span>
      </div>
      <TooltipProvider delayDuration={850}>
        <div className="compact-titlebar__controls">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Küçült" className="titlebar-button" onClick={() => void desktop.window.minimize()}>
                <Minus aria-hidden="true" size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Küçült</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Sistem tepsisine küçült" className="titlebar-button titlebar-button--close" onClick={() => void desktop.window.close()}>
                <X aria-hidden="true" size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Tepsiye küçült</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  )
}
