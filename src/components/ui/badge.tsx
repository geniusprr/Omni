import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('ui-badge', {
  variants: {
    variant: {
      default: 'ui-badge--default',
      secondary: 'ui-badge--secondary',
      outline: 'ui-badge--outline',
      success: 'ui-badge--success',
      danger: 'ui-badge--danger',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
