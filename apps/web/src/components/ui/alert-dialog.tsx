"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { cn } from "@/lib/utils"

/**
 * A confirmation for a critical action must be dismissed by an
 * explicit choice — never by Escape or an outside/backdrop press
 * (Demo-Ready 009B gate §2). Base UI's own `onOpenChange` reports the
 * dismissal `reason`; calling `eventDetails.cancel()` for
 * `"escape-key"`/`"outside-press"` tells Base UI not to close on its
 * own, using the primitive's real event API rather than a hand-rolled
 * global keydown listener. Every other reason (Cancel press, Confirm
 * press via the caller's own `onOpenChange(false)`, imperative close)
 * passes through unchanged.
 */
function AlertDialog({ onOpenChange, ...props }: AlertDialogPrimitive.Root.Props) {
  return (
    <AlertDialogPrimitive.Root
      {...props}
      onOpenChange={(open, eventDetails) => {
        if (!open && (eventDetails.reason === "escape-key" || eventDetails.reason === "outside-press")) {
          eventDetails.cancel();
          return;
        }
        onOpenChange?.(open, eventDetails);
      }}
    />
  )
}

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogBackdrop({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({ className, children, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogBackdrop />
      <AlertDialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          className={cn(
            "flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg ring-1 ring-foreground/10 outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/** Cancel is a plain `Dialog.Close` — the alert dialog has no separate "cancel" part; any non-destructive dismissal closes it the same way. */
const AlertDialogCancel = AlertDialogPrimitive.Close

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
}
