import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

/* shadcn/ui Switch — Radix UI 기반, Tailwind로 스타일링.
   원본: https://ui.shadcn.com/docs/components/switch
   기본 색은 data-state 속성으로 CSS 분기. className으로 외부에서 색 오버라이드 가능. */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className = '', ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent ' +
      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ' +
      'disabled:cursor-not-allowed disabled:opacity-50 ' +
      'data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-slate-600 ' +
      className
    }
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={
        'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 ' +
        'transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
      }
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
