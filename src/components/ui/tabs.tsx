import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = { value: string; onValueChange: (value: string) => void }
const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('Tabs bileşenleri bir Tabs içinde kullanılmalı.')
  return context
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
}

function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn('ui-tabs', className)} {...props} />
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} role="tablist" className={cn('ui-tabs__list', className)} {...props} />
))
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ value, className, onClick, ...props }, ref) => {
  const context = useTabs()
  const active = context.value === value
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      className={cn('ui-tabs__trigger', className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) context.onValueChange(value)
      }}
      {...props}
    />
  )
})
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ value, className, ...props }, ref) => {
  const context = useTabs()
  if (context.value !== value) return null
  return <div ref={ref} role="tabpanel" className={cn('ui-tabs__content', className)} {...props} />
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
