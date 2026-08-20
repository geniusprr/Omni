import React from 'react'
import Minus from 'lucide-react/dist/esm/icons/minus.js'
import Square from 'lucide-react/dist/esm/icons/square.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desktop } from '@/lib/desktop'

export function GlassTitlebar() {
  function handleDoubleClick(e: React.MouseEvent) {
    // Only toggle maximize if not clicking on a button
    if ((e.target as HTMLElement).closest('button')) return
    void desktop.window.toggleMaximize()
  }

  return (
    <header
      className="glass-titlebar"
      data-window-drag
      onDoubleClick={handleDoubleClick}
    >
      <div className="glass-titlebar__left" data-window-drag>
        <span className="glass-brand-mark" aria-hidden="true">
          <span />
        </span>
      </div>

      <div className="glass-titlebar__spacer" data-window-drag />

      <TooltipProvider delayDuration={600}>
        <div className="glass-titlebar__controls">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Küçült"
                className="titlebar-button titlebar-button--minimize"
                onClick={() => void desktop.window.minimize()}
              >
                <Minus aria-hidden="true" size={13} />
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
                <Square aria-hidden="true" size={11} />
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
                <X aria-hidden="true" size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Tepsiye küçült</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  )
}
