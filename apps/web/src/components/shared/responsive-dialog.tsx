"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { X } from "lucide-react";

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
 *
 * `children` is always wrapped in its own `min-h-0 flex-1 overflow-y-auto`
 * region, with header/footer as fixed siblings outside it (AJUSTE UI
 * "Dialog Ajustar Estoque" — originally added for the Estoque module's
 * "Ajustar estoque" Dialog, which has since moved to its own routed
 * page, `/estoque/ajustar`, and no longer uses `ResponsiveDialog` at
 * all; the structural fix stayed because it protects every other
 * consumer too): `DialogContent`'s Popup has no max-height of its own,
 * so a long form could grow taller than a short viewport (e.g.
 * 1366x641) and get its header/footer pushed off-screen with no way to
 * scroll back to them. The Dialog branch caps the Popup at
 * `max-h-[calc(100dvh-2rem)]` so this wrapper's scroll actually
 * activates instead of the Popup just overflowing the viewport; the
 * Sheet branch already caps at `max-h-[85dvh]` (`sheet.tsx`, untouched)
 * — this wrapper additionally keeps its header/footer reachable even
 * if the middle content alone would exceed that height. Purely
 * structural: no dialog's own `children`/`footer` content changes, so
 * every existing caller (RegisterReceiptDialog, CreateCustomerDialog,
 * MarkAsPaidDialog, …) keeps rendering identically when its content
 * already fit.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  showClose = false,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  showClose?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size={size}
          showClose={showClose}
          className="max-h-[calc(100dvh-2rem)] overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden">
        <SheetHeader className={cn("shrink-0", showClose ? "relative pr-8" : undefined)}>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
          {showClose ? (
            <SheetClose
              className="absolute top-0 right-0 flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fechar"
            >
              <X className="size-4" aria-hidden="true" />
            </SheetClose>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <SheetFooter className="shrink-0">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
