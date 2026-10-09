"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import {
  ArrowRight,
  BellDot,
  Coffee,
  GitMerge,
  GitPullRequest,
  Hourglass,
  Inbox,
  Sparkles,
} from "lucide-react";
import { EVENT_META } from "@contrib/core/derive";
import type { EventType } from "@contrib/core/types";
import { useToday, type ActivityEntry } from "@/lib/api";
import { greeting, plural, relative, slug } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/page-header";
import { ItemLine, NeedsYouCard, useOpenItem } from "@/components/items/item-card";
import { TONE_CLASSES } from "@/components/status";
import { useApp } from "@/components/shell/app-context";

export function TodayView() {
  const { data, isLoading } = useToday();
  const { user } = useApp();
  const firstName = (user.name ?? user.login).split(" ")[0];
  const [hello, setHello] = React.useState("Hello");
  React.useEffect(() => setHello(greeting()), []);

  return (
    <div className="space-y-8">
      <section className="hero-surface border-line -mx-4 rounded-none border-b px-4 pt-2 pb-7 sm:mx-0 sm:rounded-[20px] sm:border sm:px-8 sm:pt-7">
        <p className="text-accent-fg text-[13px] font-medium">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">
          {hello}, {firstName}.
        </h1>
        {isLoading || !data ? (
          <Skeleton className="mt-3 h-5 w-80 max-w-full" />
        ) : (
          <p
            className="text-ink-muted mt-2 font-serif text-[17px] leading-relaxed"
            data-testid="today-summary"
          >
            <strong className="text-attention-fg font-sans font-semibold">
              {plural(data.stats.needsYou, "thing")} need{data.stats.needsYou === 1 ? "s" : ""} you
            </strong>
            <span aria-hidden> · </span>
            {data.stats.waiting} waiting on maintainers
            <span aria-hidden> · </span>
            {plural(data.stats.mergedThisWeek, "PR")} merged this week
            {data.stats.newSinceLastVisit > 0 ? (
              <>
                <span aria-hidden> · </span>
                <span className="text-ink">
                  {data.stats.newSinceLastVisit} new since your last visit
                </span>
              </>
            ) : null}
          </p>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={GitPullRequest} label="Open PRs" value={data?.stats.openPrs} />
          <Stat icon={Hourglass} label="Open issues" value={data?.stats.openIssues} />
          <Stat icon={GitMerge} label="Merged, all time" value={data?.stats.mergedTotal} />
          <Stat icon={Inbox} label="Unread inbox" value={data?.stats.unreadInbox} href="/inbox" />
        </dl>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="needs-you">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="needs-you" className="flex items-center gap-2 text-[17px] font-semibold">
              <Sparkles className="text-accent size-[18px]" /> Needs you
              {data ? (
                <span className="text-ink-subtle tabular font-mono text-[13px] font-normal">
                  {data.needsYou.length}
                </span>
              ) : null}
            </h2>
            {data?.snoozedCount ? (
              <span className="text-ink-subtle text-[12.5px]">{data.snoozedCount} snoozed</span>
            ) : null}
          </div>
          {isLoading || !data ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-[16px]" />
              ))}
            </div>
          ) : data.needsYou.length === 0 ? (
            <Card>
              <EmptyState icon={<Coffee />} title="Nothing needs you right now">
                Every open thread is waiting on someone else. A good moment to pick up something new
                — or rest.
              </EmptyState>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {data.needsYou.map((row, i) => (
                  <NeedsYouCard key={row.id} row={row} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Waiting on others"
              description="Oldest first — the ones most likely to need a nudge."
              icon={<Hourglass className="text-info size-4" />}
            />
            <div className="px-2 pb-3">
              {isLoading || !data ? (
                <div className="space-y-2 px-3 pb-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : data.waiting.length ? (
                data.waiting.slice(0, 8).map((row) => <ItemLine key={row.id} row={row} />)
              ) : (
                <p className="text-ink-muted px-3 pb-3 font-serif text-[14px]">
                  Nothing is blocked on maintainers.
                </p>
              )}
              {data && data.waiting.length > 8 ? (
                <Link
                  href="/items?ball=maintainer,ci&state=open"
                  className="text-accent-fg mx-3 mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline"
                >
                  All {data.waiting.length} <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Recent activity"
              icon={<BellDot className="text-accent size-4" />}
              action={
                <Link
                  href="/inbox"
                  className="text-accent-fg text-[12.5px] font-medium hover:underline"
                >
                  Inbox
                </Link>
              }
            />
            <ActivityFeed
              entries={data?.activity}
              since={data?.lastVisitAt ?? null}
              loading={isLoading}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  href?: string;
}) {
  const body = (
    <div className="border-line bg-surface-1/70 hover:border-line-strong rounded-[14px] border px-4 py-3 backdrop-blur-sm transition-colors">
      <dt className="text-ink-subtle flex items-center gap-1.5 text-[12px]">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="text-ink tabular mt-1 font-mono text-[24px] font-medium tracking-tight">
        {value ?? "–"}
      </dd>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ActivityFeed({
  entries,
  since,
  loading,
}: {
  entries: ActivityEntry[] | undefined;
  since: string | null;
  loading?: boolean;
}) {
  const open = useOpenItem();
  if (loading || !entries) {
    return (
      <div className="space-y-3 px-5 pb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }
  if (!entries.length)
    return (
      <p className="text-ink-muted px-5 pb-5 font-serif text-[14px]">
        No activity yet. It shows up here after the first sync.
      </p>
    );
  return (
    <ol className="px-2 pb-3">
      {entries.slice(0, 14).map((e) => {
        const meta = EVENT_META[e.type as EventType] ?? { label: e.type, tone: "neutral" as const };
        const fresh = since ? Date.parse(e.at) > Date.parse(since) : e.unread;
        return (
          <li key={e.id}>
            <button
              onClick={() => open(e.item.id)}
              className="hover:bg-surface-2 flex w-full items-start gap-3 rounded-[10px] px-3 py-2 text-left transition-colors"
            >
              <span
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_CLASSES[meta.tone].dot)}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[13px]">
                  <span className="font-medium">{meta.label}</span>
                  {e.actor ? (
                    <span className="text-ink-muted font-mono text-[12px]"> @{e.actor}</span>
                  ) : null}
                  {fresh ? (
                    <span className="bg-accent text-accent-ink ml-1.5 rounded px-1 text-[10px] font-semibold tracking-wide uppercase">
                      new
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-muted block truncate text-[12.5px]">{e.item.title}</span>
                <span className="text-ink-subtle block font-mono text-[11px]">
                  {slug(e.item.repoFullName, e.item.number)}
                </span>
              </span>
              <time className="text-ink-subtle tabular shrink-0 text-[11.5px]">
                {relative(e.at)}
              </time>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
