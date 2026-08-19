import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { cn } from '@/lib/utils'

function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('ui-calendar', className)}
      classNames={{
        months: 'ui-calendar__months',
        month: 'ui-calendar__month',
        month_caption: 'ui-calendar__caption',
        caption_label: 'ui-calendar__caption-label',
        nav: 'ui-calendar__nav',
        button_previous: 'ui-calendar__nav-button',
        button_next: 'ui-calendar__nav-button',
        month_grid: 'ui-calendar__grid',
        weekdays: 'ui-calendar__weekdays',
        weekday: 'ui-calendar__weekday',
        week: 'ui-calendar__week',
        day: 'ui-calendar__day',
        day_button: 'ui-calendar__day-button',
        selected: 'is-selected',
        today: 'is-today',
        outside: 'is-outside',
        disabled: 'is-disabled',
        hidden: 'is-hidden',
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          if (orientation === 'left') return <ChevronLeft className={iconClassName} {...iconProps} aria-hidden="true" />
          if (orientation === 'right') return <ChevronRight className={iconClassName} {...iconProps} aria-hidden="true" />
          return <ChevronDown className={iconClassName} {...iconProps} aria-hidden="true" />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
