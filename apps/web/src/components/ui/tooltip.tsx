"use client";

import * as React from "react";
import * as TP from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TP.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <TP.Root delayDuration={250}>
      <TP.Trigger asChild>{children}</TP.Trigger>
      <TP.Portal>
        <TP.Content
          side={side}
          sideOffset={6}
          className={cn(
            "bg-ink text-ink-inverse z-[60] max-w-64 animate-[pop-in_120ms_var(--ease-out)] rounded-[8px] px-2.5 py-1.5 text-[12px] leading-snug shadow-md",
            className,
          )}
        >
          {content}
        </TP.Content>
      </TP.Portal>
    </TP.Root>
  );
}
