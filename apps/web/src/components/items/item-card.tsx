"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  Archive,
  ArrowUpRight,
  CalendarClock,
  Clock3,
  MoreHorizontal,
  Pin,
  PinOff,
} from "lucide-react";
import type { ItemRow } from "@contrib/core/types";
import { cn } from "@/lib/utils";
import { dueLabel, relative, slug, snoozeOptions } from "@/lib/format";
import { useUpdateMeta } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
  CiBadge,
  KindIcon,
  PriorityBadge,
  ReasonChip,
  ReviewerStack,
  StageBadge,
  TagPill,
} from "@/components/status";

/** Open an item in the global side drawer (URL-driven so it survives reloads and back button). */
export function useOpenItem() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return React.useCallback(
    (id: string) => {
      const next = new URLSearchParams(sp.toString());
      next.set("item", id);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}

export function ItemTitleLine({
  row,
  className,
  linkTitle = false,
}: {
  row: ItemRow;
  className?: string;
  linkTitle?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-ink-subtle flex items-center gap-1.5 text-[12px]">
        <KindIcon kind={row.kind} state={row.state} isDraft={row.isDraft} />
        <span className="truncate font-mono">{slug(row.repoFullName, row.number)}</span>
        {row.source !== "github" ? (
          <span className="bg-surface-2 rounded px-1 text-[10.5px] font-medium tracking-wide uppercase">
            {row.source}
          </span>
        ) : null}
        {row.hasUnseenActivity && row.state === "open" ? (
          <span className="bg-accent size-1.5 rounded-full" aria-label="New activity" />
        ) : null}
      </div>
      <p
        className={cn(
          "text-ink mt-0.5 line-clamp-2 text-[14.5px] leading-snug font-medium",
          linkTitle && "group-hover:underline",
        )}
      >
        {row.title}
      </p>
    </div>
  );
}

export function ItemActions({ row, compact }: { row: ItemRow; compact?: boolean }) {
  const update = useUpdateMeta();
  const set = (
    patch: Parameters<typeof update.mutate>[0]["patch"],
    msg: string,
    undo?: Parameters<typeof update.mutate>[0]["patch"],
  ) =>
    update.mutate(
      { id: row.id, patch },
      {
        onSuccess: () =>
          toast(
            msg,
            undo
              ? {
                  action: {
                    label: "Undo",
                    onClick: () => update.mutate({ id: row.id, patch: undo }),
                  },
                }
              : undefined,
          ),
      },
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon-sm" : "icon"}
          aria-label={`Actions for ${row.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
        {snoozeOptions().map((o) => (
          <DropdownMenuItem
            key={o.label}
            onSelect={() =>
              set({ snoozedUntil: o.iso }, `Snoozed — ${o.label.toLowerCase()}`, {
                snoozedUntil: null,
              })
            }
          >
            <Clock3 /> {o.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            set({ pinned: !row.meta.pinned }, row.meta.pinned ? "Unpinned" : "Pinned")
          }
        >
          {row.meta.pinned ? <PinOff /> : <Pin />} {row.meta.pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            set({ archived: !row.meta.archived }, row.meta.archived ? "Unarchived" : "Archived", {
              archived: row.meta.archived,
            })
          }
        >
          <Archive /> {row.meta.archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        {row.url ? (
          <DropdownMenuItem asChild>
            <a href={row.url} target="_blank" rel="noreferrer">
              <ArrowUpRight /> Open on GitHub
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Card for the "Needs you" queue. */
export function NeedsYouCard({
  row,
  index = 0,
  selected,
}: {
  row: ItemRow;
  index?: number;
  selected?: boolean;
}) {
  const open = useOpenItem();
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 8) * 0.025 }}
      data-item-id={row.id}
      data-selected={selected || undefined}
      className={cn(
        "group card hover:border-line-strong relative flex cursor-pointer flex-col gap-3 p-4 transition-[border-color,box-shadow] duration-150 hover:shadow-md",
        selected && "border-accent/60 ring-accent/25 ring-2",
        row.meta.pinned &&
          "before:bg-accent before:absolute before:top-4 before:left-0 before:h-6 before:w-[3px] before:rounded-r",
      )}
      onClick={() => open(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") open(row.id);
      }}
      tabIndex={0}
      aria-label={`${row.title} — ${row.attentionReasons.map((r) => r.label).join(", ")}`}
    >
      <div className="flex items-start gap-3">
        <ItemTitleLine row={row} className="flex-1" linkTitle />
        <div className="-mt-1 -mr-2 flex items-center opacity-70 transition-opacity group-hover:opacity-100">
          <ItemActions row={row} compact />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.attentionReasons.slice(0, 3).map((r) => (
          <ReasonChip key={r.code + r.label} reason={r} />
        ))}
        {row.attentionReasons.length === 0 ? <StageBadge stage={row.effectiveStage} /> : null}
        <PriorityBadge priority={row.meta.priority} />
      </div>
      {row.nextAction ? (
        <p className="text-ink-muted flex items-start gap-2 font-serif text-[14px] leading-snug">
          <span aria-hidden className="bg-accent mt-[7px] size-1.5 shrink-0 rounded-full" />
          {row.nextAction}
        </p>
      ) : null}
      <div className="border-line text-ink-subtle mt-auto flex items-center gap-3 border-t pt-3 text-[12px]">
        {row.kind === "pr" ? <CiBadge ci={row.ciState} compact /> : null}
        <ReviewerStack reviewers={row.reviewers} size={20} />
        {row.meta.dueAt ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" /> {dueLabel(row.meta.dueAt)}
          </span>
        ) : null}
        <span className="tabular ml-auto" title={row.lastActivityAt ?? undefined}>
          {relative(row.lastActivityAt ?? row.ghUpdatedAt)}
        </span>
      </div>
    </motion.article>
  );
}

/** Dense one-line row used in "Waiting", repo drawers, search results. */
export function ItemLine({
  row,
  selected,
  right,
}: {
  row: ItemRow;
  selected?: boolean;
  right?: React.ReactNode;
}) {
  const open = useOpenItem();
  return (
    <button
      data-item-id={row.id}
      data-selected={selected || undefined}
      onClick={() => open(row.id)}
      className={cn(
        "group hover:bg-surface-2 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-150",
        selected && "bg-surface-2 ring-accent/30 ring-2",
      )}
    >
      <KindIcon kind={row.kind} state={row.state} isDraft={row.isDraft} />
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13.5px] font-medium">{row.title}</p>
        <p className="text-ink-subtle truncate font-mono text-[11.5px]">
          {slug(row.repoFullName, row.number)} · {relative(row.lastActivityAt ?? row.ghUpdatedAt)}
        </p>
      </div>
      {right ?? (
        <div className="hidden items-center gap-2 sm:flex">
          {row.attentionReasons.find(
            (r) => r.code === "stale_ping" || r.code === "approved_unmerged",
          ) ? (
            <ReasonChip
              reason={
                row.attentionReasons.find(
                  (r) => r.code === "stale_ping" || r.code === "approved_unmerged",
                )!
              }
              size="xs"
            />
          ) : (
            <StageBadge stage={row.effectiveStage} size="xs" />
          )}
          {row.kind === "pr" ? <CiBadge ci={row.ciState} compact /> : null}
        </div>
      )}
    </button>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <TagPill key={t} tag={t} />
      ))}
    </div>
  );
}

export function ItemLink({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={`/items/${encodeURIComponent(id)}`} className={className}>
      {children}
    </Link>
  );
}
