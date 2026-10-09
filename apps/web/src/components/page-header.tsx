import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-ink-subtle mb-1.5 text-[12px] font-medium">{eyebrow}</div>
        ) : null}
        <h1 className="text-ink text-[26px] font-semibold tracking-[-0.02em] sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-muted mt-1.5 max-w-2xl text-[14px]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="border-line bg-surface-2 text-ink-muted mb-4 flex size-11 items-center justify-center rounded-[14px] border [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {children ? (
        <p className="text-ink-muted mt-1.5 max-w-sm font-serif text-[15px] leading-relaxed">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
