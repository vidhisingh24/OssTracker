"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Circle, CircleDot, Github, Inbox as InboxIcon, Sparkle } from "lucide-react";
import { EVENT_META } from "@contrib/core/derive";
import type { EventType } from "@contrib/core/types";
import { postJson, useInbox, type InboxEntry } from "@/lib/api";
import { fullDate, relative, slug } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, TONE_CLASSES } from "@/components/status";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useUrlFilters } from "@/components/items/filter-bar";
import { useOpenItem } from "@/components/items/item-card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

const GH_REASONS: Record<string, string> = {
  mention: "Mentioned",
  review_requested: "Review requested",
  comment: "Comment",
  author: "Your thread",
  assign: "Assigned",
  ci_activity: "CI activity",
  state_change: "State change",
  subscribed: "Subscribed",
  team_mention: "Team mention",
  manual: "Subscribed",
  approval_requested: "Approval requested",
  security_alert: "Security alert",
};

export function InboxView() {
  const { sp, set } = useUrlFilters();
  const source = sp.get("source") ?? "all";
  const unread = sp.get("unread") === "1";
  const types = sp.get("type")?.split(",").filter(Boolean) ?? [];
  const query = new URLSearchParams({
    source,
    ...(unread ? { unread: "1" } : {}),
    ...(types.length ? { type: types.join(",") } : {}),
  }).toString();
  const { data, isLoading } = useInbox(query);
  const qc = useQueryClient();
  const open = useOpenItem();

  const mark = async (keys: string[], read: boolean) => {
    qc.setQueriesData<{ entries: InboxEntry[] }>({ queryKey: ["inbox"] }, (old) =>
      old
        ? {
            ...old,
            entries: old.entries.map((e) => (keys.includes(e.key) ? { ...e, unread: !read } : e)),
          }
        : old,
    );
    try {
      await postJson("/api/inbox", { keys, read });
    } finally {
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["unread"] });
    }
  };
  const markAll = async () => {
    await postJson("/api/inbox", { all: true, source });
    toast.success("All caught up");
    void qc.invalidateQueries({ queryKey: ["inbox"] });
    void qc.invalidateQueries({ queryKey: ["unread"] });
    void qc.invalidateQueries({ queryKey: ["today"] });
  };

  const reasonOptions =
    source === "github"
      ? Object.entries(GH_REASONS)
      : source === "event"
        ? Object.entries(EVENT_META).map(([k, v]) => [k, v.label] as const)
        : [];

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="GitHub notifications and the changes Contrib detected, in one stream."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void markAll()}>
            <CheckCheck /> Mark all read
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={source}
          onValueChange={(v) => set({ source: v === "all" ? null : v, type: null })}
        >
          <TabsList>
            <TabsTrigger value="all">
              All{" "}
              {data ? (
                <span className="tabular font-mono text-[11px]">{data.counts.total}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="github">
              <Github className="size-3.5" /> GitHub{" "}
              {data ? (
                <span className="tabular font-mono text-[11px]">{data.counts.github}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="event">
              <Sparkle className="size-3.5" /> Detected{" "}
              {data ? (
                <span className="tabular font-mono text-[11px]">{data.counts.event}</span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant={unread ? "subtle" : "ghost"}
          size="sm"
          aria-pressed={unread}
          onClick={() => set({ unread: unread ? null : "1" })}
        >
          <CircleDot /> Unread only
        </Button>
        {reasonOptions.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Reason{types.length ? ` · ${types.length}` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {reasonOptions.map(([k, label]) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={types.includes(k)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(c) =>
                    set({ type: c ? [...types, k] : types.filter((t) => t !== k) })
                  }
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Card className="overflow-hidden">
        {isLoading || !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data.entries.length === 0 ? (
          <EmptyState icon={<InboxIcon />} title={unread ? "Inbox zero" : "Nothing here yet"}>
            {unread
              ? "You've read everything. Nicely done."
              : "Notifications appear here as GitHub reports them and as Contrib notices changes."}
          </EmptyState>
        ) : (
          <ul className="divide-line divide-y">
            {data.entries.map((e) => {
              const isEvent = e.source === "event";
              const meta = isEvent
                ? (EVENT_META[e.type as EventType] ?? { label: e.type, tone: "neutral" as const })
                : {
                    label: GH_REASONS[e.type] ?? e.type,
                    tone: e.priority === "high" ? ("attention" as const) : ("neutral" as const),
                  };
              return (
                <li
                  key={e.key}
                  data-item-id={e.itemId ?? undefined}
                  className={cn(
                    "group hover:bg-surface-2/60 flex items-start gap-3 px-4 py-3 transition-colors",
                    e.unread && "bg-attention-bg/25",
                  )}
                >
                  <button
                    aria-label={e.unread ? "Mark read" : "Mark unread"}
                    onClick={() => void mark([e.key], e.unread)}
                    className="text-accent mt-1 shrink-0 rounded-full"
                    title={e.unread ? "Mark read" : "Mark unread"}
                  >
                    {e.unread ? (
                      <span className="bg-accent block size-2.5 rounded-full" />
                    ) : (
                      <Circle className="text-ink-subtle size-2.5 opacity-0 group-hover:opacity-100" />
                    )}
                  </button>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (e.unread) void mark([e.key], true);
                      if (e.itemId) open(e.itemId);
                      else if (e.url) window.open(e.url, "_blank", "noopener");
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="xs" tone={meta.tone} icon={isEvent ? Sparkle : Github}>
                        {meta.label}
                      </Chip>
                      {e.actor ? (
                        <span className="text-ink-muted font-mono text-[12px]">@{e.actor}</span>
                      ) : null}
                      <span className="text-ink-subtle font-mono text-[11.5px]">
                        {slug(e.repoFullName, e.number)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-1 truncate text-[13.5px]",
                        e.unread ? "text-ink font-semibold" : "text-ink-muted",
                      )}
                    >
                      {e.title}
                    </p>
                    {e.excerpt ? (
                      <p className="text-ink-muted mt-0.5 line-clamp-2 font-serif text-[13.5px]">
                        {e.excerpt}
                      </p>
                    ) : null}
                  </button>
                  <time
                    className={cn("tabular shrink-0 text-[12px]", TONE_CLASSES.neutral.text)}
                    title={fullDate(e.at)}
                  >
                    {relative(e.at)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
