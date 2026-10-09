"use client";

import * as React from "react";
import * as CB from "@radix-ui/react-checkbox";
import * as SW from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentPropsWithoutRef<typeof CB.Root>) {
  return (
    <CB.Root
      className={cn(
        "border-line-strong bg-surface-1 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        className,
      )}
      {...props}
    >
      <CB.Indicator className="text-accent-ink">
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CB.Indicator>
    </CB.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        "border-line-strong bg-surface-3 data-[state=checked]:border-accent data-[state=checked]:bg-accent relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150",
        className,
      )}
      {...props}
    >
      <SW.Thumb className="bg-surface-1 block size-4 translate-x-0.5 rounded-full shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-[17px]" />
    </SW.Root>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "border-line bg-surface-2 inline-flex items-center gap-1 rounded-[12px] border p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "text-ink-muted hover:text-ink data-[state=active]:bg-surface-1 data-[state=active]:text-ink inline-flex h-7 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors duration-150 data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ariaLabel,
  size = "md",
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "border-line-strong bg-surface-1 text-ink hover:bg-surface-2 data-[placeholder]:text-ink-subtle inline-flex items-center justify-between gap-2 rounded-[10px] border px-3 shadow-sm transition-colors",
          size === "sm" ? "h-8 text-[13px]" : "h-9 text-sm",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="text-ink-muted size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="border-line bg-surface-1 z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[12px] border shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="text-ink data-[highlighted]:bg-surface-2 relative flex cursor-default items-center rounded-[8px] py-1.5 pr-2.5 pl-8 text-[13px] outline-none select-none"
              >
                <span className="absolute left-2.5">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="text-accent-fg size-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
