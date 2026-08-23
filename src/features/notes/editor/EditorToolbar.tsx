import Bold from 'lucide-react/dist/esm/icons/bold.js'
import Code from 'lucide-react/dist/esm/icons/code.js'
import Code2 from 'lucide-react/dist/esm/icons/code-2.js'
import Eye from 'lucide-react/dist/esm/icons/eye.js'
import Italic from 'lucide-react/dist/esm/icons/italic.js'
import Link2 from 'lucide-react/dist/esm/icons/link-2.js'
import List from 'lucide-react/dist/esm/icons/list.js'
import ListChecks from 'lucide-react/dist/esm/icons/list-checks.js'
import ListOrdered from 'lucide-react/dist/esm/icons/list-ordered.js'
import Minus from 'lucide-react/dist/esm/icons/minus.js'
import Quote from 'lucide-react/dist/esm/icons/quote.js'
import Redo2 from 'lucide-react/dist/esm/icons/redo-2.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Strikethrough from 'lucide-react/dist/esm/icons/strikethrough.js'
import Type from 'lucide-react/dist/esm/icons/type.js'
import Undo2 from 'lucide-react/dist/esm/icons/undo-2.js'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { EditorMode } from '../types'
import type { EditorFormatCommand } from './CodeMirrorEditor'
import type { RichTextFormatState } from './RichTextEditor'

interface EditorToolbarProps {
  mode: EditorMode
  formatState: RichTextFormatState
  onModeChange: (mode: EditorMode) => void
  onFormat: (command: EditorFormatCommand) => void
  onUndo: () => void
  onRedo: () => void
  onSearch: () => void
}

interface ToolButtonProps {
  label: string
  shortcut?: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, shortcut, disabled, active, onClick, children }: ToolButtonProps) {
  const tooltip = shortcut ? `${label} · ${shortcut}` : label

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className={`notes-toolbar-button ${active ? 'notes-toolbar-button--active' : ''}`}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active || undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function EditorToolbar({
  mode,
  formatState,
  onModeChange,
  onFormat,
  onUndo,
  onRedo,
  onSearch,
}: EditorToolbarProps) {
  const editingDisabled = mode === 'reading'

  return (
    <TooltipProvider delayDuration={350}>
      <div className="notes-editor-toolbar" role="toolbar" aria-label="Not biçimlendirme araçları">
        <div className="notes-toolbar-group notes-toolbar-group--block-style">
          <Select
            value={mode === 'live' ? formatState.blockType : 'paragraph'}
            disabled={editingDisabled}
            onValueChange={(value) => onFormat(value as EditorFormatCommand)}
          >
            <SelectTrigger className="notes-toolbar-select" aria-label="Metin stili">
              <Type size={14} />
              <SelectValue placeholder="Metin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paragraph">Normal metin</SelectItem>
              <SelectItem value="heading1">Başlık 1</SelectItem>
              <SelectItem value="heading2">Başlık 2</SelectItem>
              <SelectItem value="heading3">Başlık 3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="notes-toolbar-separator" aria-hidden="true" />

        <div className="notes-toolbar-group">
          <ToolButton label="Kalın" shortcut="Ctrl+B" disabled={editingDisabled} active={mode === 'live' && formatState.bold} onClick={() => onFormat('bold')}>
            <Bold size={15} />
          </ToolButton>
          <ToolButton label="İtalik" shortcut="Ctrl+I" disabled={editingDisabled} active={mode === 'live' && formatState.italic} onClick={() => onFormat('italic')}>
            <Italic size={15} />
          </ToolButton>
          <ToolButton label="Üstü çizili" disabled={editingDisabled} active={mode === 'live' && formatState.strike} onClick={() => onFormat('strike')}>
            <Strikethrough size={15} />
          </ToolButton>
          <ToolButton label="Satır içi kod" disabled={editingDisabled} active={mode === 'live' && formatState.inlineCode} onClick={() => onFormat('inlineCode')}>
            <Code size={15} />
          </ToolButton>
        </div>

        <span className="notes-toolbar-separator" aria-hidden="true" />

        <div className="notes-toolbar-group">
          <ToolButton label="Madde işaretli liste" disabled={editingDisabled} active={mode === 'live' && formatState.bulletList} onClick={() => onFormat('bulletList')}>
            <List size={15} />
          </ToolButton>
          <ToolButton label="Numaralı liste" disabled={editingDisabled} active={mode === 'live' && formatState.orderedList} onClick={() => onFormat('orderedList')}>
            <ListOrdered size={15} />
          </ToolButton>
          <ToolButton label="Yapılacaklar listesi" disabled={editingDisabled} active={mode === 'live' && formatState.taskList} onClick={() => onFormat('taskList')}>
            <ListChecks size={15} />
          </ToolButton>
          <ToolButton label="Alıntı" disabled={editingDisabled} active={mode === 'live' && formatState.quote} onClick={() => onFormat('quote')}>
            <Quote size={15} />
          </ToolButton>
          <ToolButton label="Bağlantı" shortcut="Ctrl+K" disabled={editingDisabled} active={mode === 'live' && formatState.link} onClick={() => onFormat('link')}>
            <Link2 size={15} />
          </ToolButton>
          <ToolButton label="Kod bloğu" disabled={editingDisabled} active={mode === 'live' && formatState.codeBlock} onClick={() => onFormat('codeBlock')}>
            <Code2 size={15} />
          </ToolButton>
          <ToolButton label="Ayırıcı" disabled={editingDisabled} onClick={() => onFormat('horizontalRule')}>
            <Minus size={15} />
          </ToolButton>
        </div>

        <span className="notes-toolbar-spacer" />

        <div className="notes-toolbar-group">
          <ToolButton label="Geri al" shortcut="Ctrl+Z" disabled={editingDisabled} onClick={onUndo}>
            <Undo2 size={15} />
          </ToolButton>
          <ToolButton label="Yinele" shortcut="Ctrl+Y" disabled={editingDisabled} onClick={onRedo}>
            <Redo2 size={15} />
          </ToolButton>
          <ToolButton label="Not içinde ara" shortcut="Ctrl+F" disabled={editingDisabled} onClick={onSearch}>
            <Search size={15} />
          </ToolButton>
        </div>

        <span className="notes-toolbar-separator" aria-hidden="true" />

        <div className="notes-toolbar-group notes-toolbar-mode-group" aria-label="Görünüm modu">
          <ToolButton label="WYSIWYG düzenle" active={mode === 'live'} onClick={() => onModeChange('live')}>
            <Type size={15} />
          </ToolButton>
          <ToolButton label="Okuma modu" active={mode === 'reading'} onClick={() => onModeChange('reading')}>
            <Eye size={15} />
          </ToolButton>
          <ToolButton label="Markdown kaynağı" active={mode === 'source'} onClick={() => onModeChange('source')}>
            <Code2 size={15} />
          </ToolButton>
        </div>
      </div>
    </TooltipProvider>
  )
}
