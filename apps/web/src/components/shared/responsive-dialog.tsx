"use client";

import type { ReactNode } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Same open/content, two surfaces: Dialog on tablet/desktop (>=768px,
 * matching the app's existing `lg`/`md` breakpoint conventions),
 * Bottom Sheet below it (Demo-Ready 009A §3/§8). Never duplicates the
 * form/content passed as `children` — only the chrome (backdrop,
 * popup shell, title/description placement) differs between the two.
 *
 * The root primitive (`Dialog`/`Sheet`) is always mounted regardless
 * of `open`, so `useMediaQuery`'s effect settles long before the user
 * ever opens this — no visible surface flash on first open.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size={size}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {children}
        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
