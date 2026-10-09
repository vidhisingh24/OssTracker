import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "border-line-strong bg-surface-1 text-ink placeholder:text-ink-subtle focus-visible:border-accent focus-visible:ring-accent/25 h-9 w-full rounded-[10px] border px-3 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "border-line-strong bg-surface-1 text-ink placeholder:text-ink-subtle focus-visible:border-accent focus-visible:ring-accent/25 min-h-24 w-full rounded-[10px] border px-3 py-2 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-ink text-[13px] font-medium", className)} {...props} />;
}
