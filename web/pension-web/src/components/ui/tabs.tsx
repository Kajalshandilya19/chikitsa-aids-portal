"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

/*
 * Full width on a phone, natural width from `sm` up.
 *
 * A horizontal tab strip sized to its labels leaves most of a phone's width empty and gives each
 * tab a target barely wider than its own text, while the same strip stretched across a desktop
 * would look like a stray toolbar. Splitting the row edge to edge below `sm` is the convention on
 * a handset and costs nothing above it.
 *
 * Done here rather than per caller because it should be true everywhere: this primitive backs the
 * outreach tabs, settings, the EMR sections and the rest. A vertical list is exempt, since its
 * width is the point.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-full items-center justify-center rounded-lg p-[3px] text-muted-foreground sm:w-fit group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:w-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Share the row evenly while the list is full width, then back to natural sizing from `sm`.
        "flex-1 sm:flex-initial group-data-vertical/tabs:flex-initial",
        // NOTE: inactive text/hover use SOLID theme tokens (muted / accent), never an
        // opacity modifier like `text-foreground/60` or `bg-foreground/5`. Those compile to
        // color-mix(), and on a browser without color-mix support they fall back to the raw
        // token, i.e. a solid black hover surface with unreadable text.
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-primary data-active:text-primary-foreground data-active:border-transparent dark:data-active:border-transparent dark:data-active:bg-primary dark:data-active:text-primary-foreground",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        // Hover only applies to INACTIVE tabs (the active one keeps its primary fill),
        // using the theme's dedicated hover pair so it reads correctly in light AND dark.
        "data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground",
        // A count Badge sitting inside the active (primary-filled) tab needs to invert,
        // otherwise a grey `secondary` pill sits on the primary colour and looks broken.
        "data-active:[&_[data-slot=badge]]:border-transparent data-active:[&_[data-slot=badge]]:bg-primary-foreground data-active:[&_[data-slot=badge]]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
