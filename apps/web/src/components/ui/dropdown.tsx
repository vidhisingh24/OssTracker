"use client";

import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuSub = DM.Sub;

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "border-line bg-surface-1 z-50 max-h-[70vh] min-w-48 animate-[pop-in_140ms_var(--ease-out)] overflow-y-auto rounded-[12px] border p-1 shadow-lg",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

const itemCls =
  "relative flex cursor-default items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[13px] text-ink outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-ink-muted";

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DM.Item>) {
  return <DM.Item className={cn(itemCls, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn(itemCls, "pl-8", className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DM.ItemIndicator>
          <Check />
        </DM.ItemIndicator>
      </span>
      {children}
    </DM.CheckboxItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DM.Label>) {
  return (
    <DM.Label
      className={cn(
        "text-ink-subtle px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DM.Separator className={cn("bg-line my-1 h-px", className)} />;
}

export function DropdownMenuSubTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DM.SubTrigger>) {
  return (
    <DM.SubTrigger
      className={cn(itemCls, "data-[state=open]:bg-surface-2", className)}
      {...props}
    />
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent
        className={cn(
          "border-line bg-surface-1 z-50 max-h-80 min-w-40 overflow-y-auto rounded-[12px] border p-1 shadow-lg",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}
