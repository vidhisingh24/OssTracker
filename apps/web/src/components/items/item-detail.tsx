"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  GitBranch,
  Link2,
  Loader2,
  Maximize2,
  MessagesSquare,
  Pin,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { EVENT_META, STAGE_META, BALL_META } from "@contrib/core/derive";
import { BALLS, PRIORITIES, STAGES, type EventType, type ItemMeta } from "@contrib/core/types";
import { fetchJson, keys, postJson, useItem, useUpdateMeta, type ItemDetail } from "@/lib/api";
import {
  fromLocalInput,
  fullDate,
  relative,
  slug,
  snoozeOptions,
  toLocalInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Avatar,
  BallBadge,
  CiBadge,
  Chip,
  KindIcon,
  LabelPill,
  ReasonChip,
  ReviewerStack,
  StageBadge,
  TONE_CLASSES,
  TagPill,
} from "@/components/status";

export function ItemDetailView({
  id,
  onClose,
  variant = "drawer",
}: {
  id: string;
  onClose?: () => void;
  variant?: "drawer" | "page";
}) {
  const { data, isLoading, error } = useItem(id);
  const update = useUpdateMeta();
  const markedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (data && markedRef.current !== id) {
      markedRef.current = id;
      update.mutate({ id, patch: { lastViewedAt: new Date().toISOString() } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, id]);

  if (error) return <p className="text-danger-fg p-6">{(error as Error).message}</p>;
  if (isLoading || !data) return <DetailSkeleton />;
  return <DetailBody d={data} onClose={onClose} variant={variant} />;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading item">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-7 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function DetailBody({
  d,
  onClose,
  variant,
}: {
  d: ItemDetail;
  onClose?: () => void;
  variant: "drawer" | "page";
}) {
  const r = d.row;
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await postJson(`/api/items/${encodeURIComponent(r.id)}/sync`, {});
      toast.success("Refresh requested", {
        description: "Fresh data will appear in a few seconds.",
      });
      setTimeout(() => void qc.invalidateQueries({ queryKey: keys.item(r.id) }), 3000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const failing = d.checks.filter(
    (c) =>
      c.conclusion &&
      ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"].includes(
        c.conclusion,
      ),
  );
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", variant === "page" && "card overflow-hidden")}
    >
      <header className="hero-surface border-line border-b px-5 pt-5 pb-4 sm:px-6">
        <div className="text-ink-subtle flex items-center gap-2 text-[12.5px]">
          <KindIcon kind={r.kind} state={r.state} isDraft={r.isDraft} />
          <span className="font-mono">{slug(r.repoFullName, r.number)}</span>
          {r.source !== "github" ? <Chip size="xs">{r.source}</Chip> : null}
          <div className="ml-auto flex items-center gap-1">
            {r.source !== "planned" ? (
              <Tooltip content="Refresh from GitHub">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={refresh}
                  disabled={refreshing}
                  aria-label="Refresh from GitHub"
                >
                  <RefreshCw className={cn(refreshing && "animate-spin")} />
                </Button>
              </Tooltip>
            ) : null}
            {variant === "drawer" ? (
              <Tooltip content="Open full page">
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link href={`/items/${encodeURIComponent(r.id)}`} aria-label="Open full page">
                    <Maximize2 />
                  </Link>
                </Button>
              </Tooltip>
            ) : null}
            {onClose ? (
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                <X />
              </Button>
            ) : null}
          </div>
        </div>
        <h2 className="text-ink mt-2 text-[20px] leading-snug font-semibold tracking-[-0.015em]">
          {r.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StageBadge stage={r.effectiveStage} overridden={!!r.meta.personalStage} />
          <BallBadge ball={r.effectiveBall} />
          {r.kind === "pr" ? <CiBadge ci={r.ciState} /> : null}
          {r.attentionReasons.map((x) => (
            <ReasonChip key={x.code + x.label} reason={x} />
          ))}
        </div>
        {r.nextAction ? (
          <p className="border-attention/25 bg-attention-bg/60 text-ink mt-3 flex items-start gap-2 rounded-[12px] border px-3 py-2 text-[13.5px]">
            <Sparkles className="text-attention-fg mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">Next: </span>
              {r.nextAction}
            </span>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.url ? (
            <Button variant="primary" size="sm" asChild>
              <a href={r.url} target="_blank" rel="noreferrer">
                Open on GitHub <ArrowUpRight />
              </a>
            </Button>
          ) : null}
          <QuickToggles id={r.id} meta={r.meta} />
        </div>
        {d.isGone ? (
          <p className="text-warning-fg mt-3 text-[13px]">
            This item is no longer reachable on GitHub ({d.hydrateError ?? "deleted or transferred"}
            ).
          </p>
        ) : null}
      </header>

      <div className="scrollbar-thin grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6 px-5 py-5 sm:px-6">
          {d.pr ? (
            <Section title="Pull request">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
                <Fact label="Branch">
                  <span className="inline-flex items-center gap-1 font-mono text-[12px]">
                    <GitBranch className="text-ink-subtle size-3.5" />
                    <span className="truncate">{d.pr.headRef}</span>
                  </span>
                </Fact>
                <Fact label="Into">
                  <span className="font-mono text-[12px]">{d.pr.baseRef}</span>
                </Fact>
                <Fact label="Diff">
                  <span className="font-mono text-[12px]">
                    <span className="text-success-fg">+{r.additions ?? 0}</span>{" "}
                    <span className="text-danger-fg">−{r.deletions ?? 0}</span> ·{" "}
                    {d.pr.changedFiles ?? 0} files
                  </span>
                </Fact>
                <Fact label="Mergeable">
                  <span
                    className={cn(
                      "text-[12.5px] font-medium",
                      d.pr.mergeable === "CONFLICTING"
                        ? "text-danger-fg"
                        : d.pr.mergeable === "MERGEABLE"
                          ? "text-success-fg"
                          : "text-ink-muted",
                    )}
                  >
                    {d.pr.mergeable === "CONFLICTING"
                      ? "Conflicts"
                      : d.pr.mergeable === "MERGEABLE"
                        ? "Clean"
                        : "Unknown"}
                  </span>
                </Fact>
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-ink-subtle mb-1.5 text-[11.5px] font-medium tracking-wide uppercase">
                    Reviewers
                  </p>
                  {r.reviewers.length ? (
                    <ul className="space-y-1.5">
                      {r.reviewers.map((rv) => (
                        <li key={rv.login} className="flex items-center gap-2 text-[13px]">
                          <ReviewerStack reviewers={[rv]} size={20} />
                          <span className="font-mono text-[12.5px]">@{rv.login}</span>
                          <span className="text-ink-subtle">
                            {rv.state === "REQUESTED"
                              ? "pending"
                              : rv.state.toLowerCase().replace("_", " ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-ink-subtle text-[13px]">No reviewers yet</p>
                  )}
                </div>
                <div className="text-ink-muted ml-auto flex items-center gap-2 text-[13px]">
                  <MessagesSquare className="size-4" />
                  <span className="tabular">{d.pr.unresolvedThreads}</span> unresolved thread
                  {d.pr.unresolvedThreads === 1 ? "" : "s"}
                </div>
              </div>
            </Section>
          ) : null}

          {d.checks.length ? (
            <Section
              title={`Checks · ${failing.length ? `${failing.length} failing` : "all good"}`}
            >
              <ul className="divide-line border-line divide-y overflow-hidden rounded-[12px] border">
                {[...d.checks]
                  .sort(
                    (a, b) =>
                      Number(!!failing.find((f) => f.id === b.id)) -
                      Number(!!failing.find((f) => f.id === a.id)),
                  )
                  .map((c) => {
                    const bad = failing.some((f) => f.id === c.id);
                    const pending = !c.conclusion;
                    const Icon = bad
                      ? XCircle
                      : pending
                        ? Loader2
                        : c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL"
                          ? CircleDashed
                          : CheckCircle2;
                    return (
                      <li
                        key={c.id}
                        className="bg-surface-1 flex items-center gap-3 px-3 py-2 text-[13px]"
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            bad
                              ? "text-danger-fg"
                              : pending
                                ? "text-warning-fg animate-spin [animation-duration:2s]"
                                : "text-success-fg",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span
                          className={cn("text-[12px]", bad ? "text-danger-fg" : "text-ink-subtle")}
                        >
                          {pending ? "running" : c.conclusion!.toLowerCase().replace("_", " ")}
                        </span>
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-ink-subtle hover:text-ink"
                            aria-label={`Open ${c.name} logs`}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </Section>
          ) : null}

          {d.body ? (
            <Section title="Description">
              <div className="prose-notes border-line bg-surface-2/40 scrollbar-thin max-h-72 overflow-y-auto rounded-[12px] border px-4 py-3 text-[14px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.body}</ReactMarkdown>
              </div>
            </Section>
          ) : null}

          <Section title="Timeline">
            <Timeline entries={d.timeline} />
          </Section>
        </div>

        <aside className="border-line bg-surface-2/30 space-y-6 border-t px-5 py-5 sm:px-6 lg:border-t-0 lg:border-l">
          <MetaPanel id={r.id} meta={r.meta} />
          <LinksPanel d={d} />
          {r.labels.length || d.assignees.length ? (
            <Section title="On GitHub">
              <div className="flex flex-wrap gap-1.5">
                {r.labels.map((l) => (
                  <LabelPill key={l.name} name={l.name} color={l.color} />
                ))}
              </div>
              {d.assignees.length ? (
                <p className="text-ink-muted mt-2 text-[12.5px]">
                  Assigned:{" "}
                  <span className="font-mono">{d.assignees.map((a) => `@${a}`).join(", ")}</span>
                </p>
              ) : null}
              {d.milestone ? (
                <p className="text-ink-muted mt-1 text-[12.5px]">Milestone: {d.milestone}</p>
              ) : null}
            </Section>
          ) : null}
          <p className="text-ink-subtle text-[11.5px]">
            Opened {relative(r.ghCreatedAt)} by{" "}
            <span className="font-mono">@{r.author ?? "?"}</span>
            {r.lastHydratedAt ? <> · synced {relative(r.lastHydratedAt)}</> : null}
          </p>
          {r.source !== "github" ? <DeleteLocal id={r.id} /> : null}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-ink-subtle mb-2.5 text-[12px] font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-subtle text-[11.5px]">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}

function QuickToggles({ id, meta }: { id: string; meta: ItemMeta }) {
  const update = useUpdateMeta();
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={meta.pinned}
        onClick={() => update.mutate({ id, patch: { pinned: !meta.pinned } })}
      >
        <Pin className={cn(meta.pinned && "text-accent fill-current")} />{" "}
        {meta.pinned ? "Pinned" : "Pin"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={meta.archived}
        onClick={() =>
          update.mutate(
            { id, patch: { archived: !meta.archived } },
            { onSuccess: () => toast(meta.archived ? "Unarchived" : "Archived") },
          )
        }
      >
        <Archive /> {meta.archived ? "Archived" : "Archive"}
      </Button>
    </>
  );
}

/* ───────────── Timeline ───────────── */

function Timeline({ entries }: { entries: ItemDetail["timeline"] }) {
  const [showAll, setShowAll] = React.useState(false);
  const list = showAll ? entries : entries.slice(-25);
  if (!entries.length)
    return <p className="text-ink-muted font-serif text-[14px]">Nothing has happened here yet.</p>;
  return (
    <div>
      {entries.length > list.length ? (
        <Button variant="link" size="sm" onClick={() => setShowAll(true)} className="mb-2">
          Show {entries.length - list.length} earlier
        </Button>
      ) : null}
      <ol className="before:bg-line-strong relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px">
        {list.map((e) =>
          e.kind === "event" ? (
            <li key={e.id} className="relative flex items-center gap-3 pl-0 text-[13px]">
              <span
                className={cn(
                  "ring-surface-1 relative z-10 ml-[7px] size-[10px] rounded-full ring-4",
                  TONE_CLASSES[EVENT_META[e.type as EventType]?.tone ?? "neutral"].dot,
                )}
                aria-hidden
              />
              <span className="text-ink-muted">
                <span className="text-ink font-medium">
                  {EVENT_META[e.type as EventType]?.label ?? e.type}
                </span>
                {e.actor ? <span className="font-mono text-[12px]"> · @{e.actor}</span> : null}
                {eventDetail(e.payload)}
              </span>
              <time
                className="text-ink-subtle tabular ml-auto shrink-0 text-[12px]"
                title={fullDate(e.at)}
              >
                {relative(e.at)}
              </time>
            </li>
          ) : (
            <li key={e.id} className="relative flex gap-3">
              <span className="ring-surface-1 relative z-10 shrink-0 rounded-full ring-4">
                <Avatar login={e.actor ?? "?"} src={e.actorAvatarUrl} size={24} />
              </span>
              <div
                className={cn(
                  "bg-surface-1 min-w-0 flex-1 rounded-[12px] border",
                  e.isMine ? "border-accent/30" : "border-line",
                )}
              >
                <div className="border-line flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-[12.5px]">
                  <span className="font-mono font-medium">@{e.actor}</span>
                  {e.isMine ? (
                    <Chip size="xs" tone="attention">
                      you
                    </Chip>
                  ) : null}
                  {e.isMaintainer ? (
                    <Chip size="xs" tone="info">
                      maintainer
                    </Chip>
                  ) : null}
                  {e.isBot ? <Chip size="xs">bot</Chip> : null}
                  {e.kind === "review" ? (
                    <Chip
                      size="xs"
                      tone={
                        e.type === "APPROVED"
                          ? "success"
                          : e.type === "CHANGES_REQUESTED"
                            ? "danger"
                            : "info"
                      }
                    >
                      {e.type === "APPROVED"
                        ? "approved"
                        : e.type === "CHANGES_REQUESTED"
                          ? "requested changes"
                          : "reviewed"}
                    </Chip>
                  ) : null}
                  <time className="text-ink-subtle tabular ml-auto" title={fullDate(e.at)}>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {relative(e.at)}
                      </a>
                    ) : (
                      relative(e.at)
                    )}
                  </time>
                </div>
                {e.body ? (
                  <div className="prose-notes px-3 py-2 text-[14px] break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{e.body}</ReactMarkdown>
                  </div>
                ) : null}
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

function eventDetail(p: Record<string, unknown>): React.ReactNode {
  if (Array.isArray(p.checks) && p.checks.length)
    return <span> — {(p.checks as string[]).join(", ")}</span>;
  if (typeof p.label === "string") return <span> — {p.label}</span>;
  if (typeof p.reviewer === "string")
    return <span className="font-mono text-[12px]"> → @{p.reviewer}</span>;
  if (typeof p.assignee === "string")
    return <span className="font-mono text-[12px]"> → @{p.assignee}</span>;
  if (typeof p.target === "string")
    return <span className="font-mono text-[12px]"> → {p.target}</span>;
  return null;
}

/* ───────────── Manual layer ───────────── */

export function MetaPanel({ id, meta }: { id: string; meta: ItemMeta }) {
  const update = useUpdateMeta();
  const save = (patch: Partial<ItemMeta>) => update.mutate({ id, patch });
  const [notes, setNotes] = React.useState(meta.notes ?? "");
  const [editing, setEditing] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  React.useEffect(() => setNotes(meta.notes ?? ""), [meta.notes, id]);

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase().replace(/^#/, "");
    if (!t || meta.tags.includes(t)) return setTagDraft("");
    save({ tags: [...meta.tags, t] });
    setTagDraft("");
  };

  return (
    <Section title="Your notes & plan">
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Priority">
            <Select
              size="sm"
              ariaLabel="Priority"
              value={meta.priority ?? "none"}
              onValueChange={(v) =>
                save({ priority: v === "none" ? null : (v as ItemMeta["priority"]) })
              }
              options={[
                { value: "none", label: "None" },
                ...PRIORITIES.map((p) => ({ value: p, label: p })),
              ]}
              className="w-full"
            />
          </Field>
          <Field label="Stage">
            <Select
              size="sm"
              ariaLabel="Stage override"
              value={meta.personalStage ?? "auto"}
              onValueChange={(v) =>
                save({ personalStage: v === "auto" ? null : (v as ItemMeta["personalStage"]) })
              }
              options={[
                { value: "auto", label: "Automatic" },
                ...STAGES.map((s) => ({ value: s, label: STAGE_META[s].label })),
              ]}
              className="w-full"
            />
          </Field>
          <Field label="Waiting on">
            <Select
              size="sm"
              ariaLabel="Ball in court override"
              value={meta.ballOverride ?? "auto"}
              onValueChange={(v) =>
                save({ ballOverride: v === "auto" ? null : (v as ItemMeta["ballOverride"]) })
              }
              options={[
                { value: "auto", label: "Automatic" },
                ...BALLS.map((b) => ({ value: b, label: BALL_META[b].label })),
              ]}
              className="w-full"
            />
          </Field>
          <Field label="Snooze">
            <Select
              size="sm"
              ariaLabel="Snooze"
              value={
                meta.snoozedUntil && Date.parse(meta.snoozedUntil) > Date.now() ? "current" : "none"
              }
              onValueChange={(v) =>
                save({
                  snoozedUntil: v === "none" ? null : v === "current" ? meta.snoozedUntil : v,
                })
              }
              options={[
                { value: "none", label: "Not snoozed" },
                ...(meta.snoozedUntil && Date.parse(meta.snoozedUntil) > Date.now()
                  ? [
                      {
                        value: "current",
                        label: `Until ${relative(meta.snoozedUntil).replace("in ", "")}`,
                      },
                    ]
                  : []),
                ...snoozeOptions().map((o) => ({ value: o.iso, label: o.label })),
              ]}
              className="w-full"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field label="Due">
            <Input
              type="datetime-local"
              className="h-8 text-[12.5px]"
              value={toLocalInput(meta.dueAt)}
              onChange={(e) => save({ dueAt: fromLocalInput(e.target.value) })}
              aria-label="Due date"
            />
          </Field>
          <Field label="Remind me">
            <Input
              type="datetime-local"
              className="h-8 text-[12.5px]"
              value={toLocalInput(meta.remindAt)}
              onChange={(e) => save({ remindAt: fromLocalInput(e.target.value) })}
              aria-label="Reminder"
            />
          </Field>
        </div>
        <Field label="Waiting-on note">
          <Input
            className="h-8 text-[12.5px]"
            defaultValue={meta.waitingOn ?? ""}
            key={`${id}-waiting`}
            placeholder="e.g. sig-cli triage, CLA bot"
            onBlur={(e) =>
              e.target.value !== (meta.waitingOn ?? "") &&
              save({ waitingOn: e.target.value || null })
            }
          />
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1">
            {meta.tags.map((t) => (
              <TagPill
                key={t}
                tag={t}
                onRemove={() => save({ tags: meta.tags.filter((x) => x !== t) })}
              />
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Add tag…"
              aria-label="Add tag"
              className="text-ink placeholder:text-ink-subtle h-6 min-w-20 flex-1 bg-transparent font-mono text-[12px] outline-none"
            />
          </div>
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label>Notes</Label>
            <Button
              variant="link"
              size="sm"
              onClick={() =>
                editing ? (save({ notes: notes || null }), setEditing(false)) : setEditing(true)
              }
            >
              {editing ? "Save" : meta.notes ? "Edit" : "Add notes"}
            </Button>
          </div>
          {editing ? (
            <Textarea
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  save({ notes: notes || null });
                  setEditing(false);
                }
              }}
              placeholder="Markdown supported. Ctrl+Enter to save."
              className="min-h-36 font-mono text-[12.5px]"
              aria-label="Notes (markdown)"
            />
          ) : meta.notes ? (
            <div
              className="prose-notes border-line bg-surface-1 rounded-[12px] border px-3 py-2 text-[14px]"
              onDoubleClick={() => setEditing(true)}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{meta.notes}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-ink-subtle font-serif text-[14px]">
              Private notes — setup steps, what the maintainer asked for, your plan.
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="text-ink-subtle block text-[11.5px] font-medium">{label}</span>
      {children}
    </div>
  );
}

function LinksPanel({ d }: { d: ItemDetail }) {
  const qc = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const [target, setTarget] = React.useState("");
  const add = async () => {
    try {
      await postJson(`/api/items/${encodeURIComponent(d.row.id)}/links`, { target });
      setTarget("");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: keys.item(d.row.id) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async (linkId: string) => {
    await fetchJson(`/api/items/${encodeURIComponent(d.row.id)}/links?linkId=${linkId}`, {
      method: "DELETE",
    });
    void qc.invalidateQueries({ queryKey: keys.item(d.row.id) });
  };
  return (
    <Section title="Linked">
      {d.links.length ? (
        <ul className="space-y-1.5">
          {d.links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-[13px]">
              <Link2 className="text-ink-subtle size-3.5 shrink-0" />
              {l.linkedItemId ? (
                <Link
                  href={`?item=${encodeURIComponent(l.linkedItemId)}`}
                  scroll={false}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  <span className="text-ink-subtle font-mono text-[12px]">
                    {l.relation === "closes"
                      ? "fixes"
                      : l.relation === "closed_by"
                        ? "fixed by"
                        : "linked"}{" "}
                    #{l.number}
                  </span>{" "}
                  {l.title}
                </Link>
              ) : (
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  <span className="text-ink-subtle font-mono text-[12px]">
                    {l.repo}#{l.number}
                  </span>{" "}
                  {l.title ?? ""}
                </a>
              )}
              {l.state ? (
                <Chip
                  size="xs"
                  tone={l.state === "merged" ? "success" : l.state === "open" ? "info" : "neutral"}
                >
                  {l.state}
                </Chip>
              ) : null}
              {l.source === "manual" && !l.id.startsWith("rev-") ? (
                <button
                  onClick={() => void remove(l.id)}
                  aria-label="Remove link"
                  className="text-ink-subtle hover:text-danger-fg"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-subtle text-[13px]">No linked issues or PRs.</p>
      )}
      {adding ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            autoFocus
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="GitHub issue/PR URL"
            className="h-8 text-[12.5px]"
            aria-label="Link target URL"
          />
          <Button size="sm" type="submit" variant="primary">
            Link
          </Button>
        </form>
      ) : (
        <Button variant="link" size="sm" className="mt-1" onClick={() => setAdding(true)}>
          + Link issue / PR
        </Button>
      )}
    </Section>
  );
}

function DeleteLocal({ id }: { id: string }) {
  const qc = useQueryClient();
  return (
    <Button
      variant="danger"
      size="sm"
      onClick={async () => {
        if (!window.confirm("Delete this item and its notes?")) return;
        await fetchJson(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
        await qc.invalidateQueries();
        window.history.back();
      }}
    >
      <Trash2 /> Delete item
    </Button>
  );
}

export function SwitchRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-[13.5px] font-medium">
          {label}
        </label>
        {description ? <p className="text-ink-muted text-[12.5px]">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
