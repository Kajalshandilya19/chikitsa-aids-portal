"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {/* Required marker: a red asterisk glued to the label text (the row's
          `gap` can't separate them). Driven by the `required` prop. */}
      {required ? (
        <span className="inline-flex items-center">
          {children}
          <span className="text-destructive ml-0.5">*</span>
        </span>
      ) : (
        children
      )}
    </LabelPrimitive.Root>
  )
}

export { Label }
