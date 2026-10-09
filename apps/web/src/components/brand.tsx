import { cn } from "@/lib/utils";

/**
 * Contrib glyph: an open ring (a "C" drawn as a branch) whose gap holds a commit node.
 * Original mark; drawn on a 24px grid.
 */
export function Glyph({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-6", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="24" height="24" rx="7" fill="var(--brand-clay)" />
      <path
        d="M16.6 8.2A6 6 0 1 0 16.6 15.8"
        fill="none"
        stroke="#141413"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="17.4" cy="12" r="2.1" fill="#141413" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Glyph />
      <span className="text-ink text-[17px] font-semibold tracking-[-0.02em]">Contrib</span>
    </span>
  );
}
