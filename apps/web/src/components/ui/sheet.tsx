"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "@/lib/utils"

/**
 * Bottom sheet, built on `@base-ui/react/drawer` (`swipeDirection`
 * defaults to `"down"`, which is exactly a bottom sheet). This is the
 * mobile counterpart of Dialog — see `responsive-dialog.tsx`, which
 * picks between the two based on viewport width. Side sheets are not
 * needed yet (see Demo-Ready 009A §6) and are intentionally not built
 * here.
 */
const Sheet = DrawerPrimitive.Root

const SheetTrigger = DrawerPrimitive.Trigger

const SheetClose = DrawerPrimitive.Close

function SheetPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetBackdrop({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="sheet-backdrop"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-black/40 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <SheetPortal>
      <SheetBackdrop />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
        <DrawerPrimitive.Popup
          data-slot="sheet-content"
          className={cn(
            "max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-border border-b-0 bg-card px-5 pt-4 text-card-foreground shadow-lg ring-1 ring-foreground/10 outline-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] [transform:translateY(var(--drawer-swipe-movement-y))] data-ending-style:translate-y-full data-starting-style:translate-y-full",
            className
          )}
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
          {...props}
        >
          <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-header" className={cn("flex flex-col gap-1 pb-3 text-center", className)} {...props} />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-footer" className={cn("flex flex-col gap-2 pt-3", className)} {...props} />
  )
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
