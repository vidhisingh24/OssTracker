"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlay =
  "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] animate-[fade-in_160ms_ease-out]";

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn(
          "border-line bg-surface-1 fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 rounded-[16px] border shadow-lg outline-none",
          "animate-[dialog-in_180ms_var(--ease-out)]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-ink-muted mt-1 text-[13px]">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {hideClose ? null : (
            <DialogPrimitive.Close
              className="text-ink-muted hover:bg-surface-2 hover:text-ink rounded-md p-1 transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="px-5 pt-4 pb-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side drawer built on Dialog (focus trap, Esc, aria-modal for free). */
export function SheetContent({
  className,
  children,
  title,
  side = "right",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  side?: "right" | "left";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn(
          "border-line bg-surface-1 fixed top-0 bottom-0 z-50 flex w-full flex-col shadow-lg outline-none",
          side === "right"
            ? "right-0 max-w-[720px] animate-[sheet-in-right_220ms_var(--ease-out)] border-l"
            : "left-0 max-w-[300px] animate-[sheet-in-left_220ms_var(--ease-out)] border-r",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
