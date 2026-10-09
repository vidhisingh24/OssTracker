import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "border-line-strong bg-surface-2 text-ink-muted inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1.5 font-mono text-[11px]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
