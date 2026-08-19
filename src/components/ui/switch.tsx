import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled}
    disabled={disabled}
    data-state={checked ? 'checked' : 'unchecked'}
    className={cn('ui-switch', className)}
    onClick={() => onCheckedChange?.(!checked)}
    {...props}
  >
    <span className="ui-switch__thumb" aria-hidden="true" />
  </button>
))
Switch.displayName = 'Switch'

export { Switch }
