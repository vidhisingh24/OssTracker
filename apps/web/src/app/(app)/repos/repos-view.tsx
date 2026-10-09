"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, BellOff, FolderGit2, Pin, Star } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChecklistItem } from "@contrib/core/types";
import { postJson, useItems, useRepos, type RepoCard } from "@/lib/api";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/controls";
import { Avatar, Chip } from "@/components/status";
import { ItemLine } from "@/components/items/item-card";
import { useUrlFilters } from "@/components/items/filter-bar";

const HEALTH: Record<
  RepoCard["health"],
  { label: string; tone: "success" | "info" | "warning" | "neutral" }
> = {
  great: { label: "Responsive", tone: "success" },
  good: { label: "Steady", tone: "info" },
  slow: { label: "Slow to respond", tone: "warning" },
  quiet: { label: "Quiet lately", tone: "neutral" },
  new: { label: "New", tone: "neutral" },
};

export function ReposView() {
  const { data, isLoading } = useRepos();
  const { sp, set } = useUrlFilters();
  const openRepo = sp.get("repo");
  const selected = data?.find((r) => r.fullName.toLowerCase() === openRepo?.toLowerCase()) ?? null;

  return (
    <div>
      <PageHeader
        title="Repos"
        description="Where you contribute — your track record, who reviews you, and your own notes per project."
      />
      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[16px]" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState icon={<FolderGit2 />} title="No repos yet">
            Repos appear after the first sync, or when you add an item by URL.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => (
            <button
              key={r.id}
              onClick={() => set({ repo: r.fullName })}
              className="card group hover:border-line-strong flex flex-col p-5 text-left transition-[border-color,box-shadow] hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <Avatar login={r.owner} size={36} className="rounded-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-ink-subtle truncate font-mono text-[12px]">{r.owner}</p>
                  <p className="truncate text-[15px] font-semibold">{r.name}</p>
                </div>
                {r.meta?.pinned ? (
                  <Pin className="text-accent size-4 fill-current" aria-label="Pinned" />
                ) : null}
                {r.meta?.muted ? (
                  <BellOff className="text-ink-subtle size-4" aria-label="Muted" />
                ) : null}
              </div>
              {r.description ? (
                <p className="text-ink-muted mt-2 line-clamp-2 font-serif text-[13.5px]">
                  {r.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Chip size="xs" tone={HEALTH[r.health].tone}>
                  {HEALTH[r.health].label}
                </Chip>
                {r.myRole === "maintainer" ? (
                  <Chip size="xs" tone="attention">
                    Maintainer
                  </Chip>
                ) : null}
                {r.meta?.programTag ? (
                  <Chip size="xs" tone="info">
                    {r.meta.programTag}
                  </Chip>
                ) : null}
                {r.stats.needsYou ? (
                  <Chip size="xs" tone="attention">
                    {r.stats.needsYou} need you
                  </Chip>
                ) : null}
              </div>
              <dl className="border-line mt-auto grid grid-cols-4 gap-2 border-t pt-3 text-center">
                <Mini label="Open PRs" value={r.stats.openPrs} />
                <Mini label="Merged" value={r.stats.mergedPrs} />
                <Mini label="Issues" value={r.stats.issues} />
                <Mini label="To merge" value={r.stats.medianMergeLabel} />
              </dl>
              <div className="text-ink-subtle mt-3 flex items-center gap-2 text-[11.5px]">
                {r.language ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: r.languageColor ?? "var(--tone-neutral-solid)" }}
                      aria-hidden
                    />
                    {r.language}
                  </span>
                ) : null}
                {r.stars ? (
                  <span className="tabular inline-flex items-center gap-1">
                    <Star className="size-3" />{" "}
                    {r.stars >= 1000 ? `${(r.stars / 1000).toFixed(1)}k` : r.stars}
                  </span>
                ) : null}
                <span className="ml-auto">
                  {r.stats.lastActivityAt ? `active ${relative(r.stats.lastActivityAt)}` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(o) => !o && set({ repo: null })}>
        <SheetContent title={selected?.fullName ?? "Repo"}>
          {selected ? <RepoDrawer repo={selected} /> : null}
        </SheetContent>
      </Dialog>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dd className="tabular font-mono text-[16px] font-medium">{value}</dd>
      <dt className="text-ink-subtle text-[11px]">{label}</dt>
    </div>
  );
}

function RepoDrawer({ repo }: { repo: RepoCard }) {
  const qc = useQueryClient();
  const { data: items } = useItems(
    `repo=${encodeURIComponent(repo.fullName)}&archived=include&pageSize=200&sort=updated`,
  );
  const m = repo.meta;
  const [draft, setDraft] = React.useState({
    notes: m?.notes ?? "",
    setupCommands: m?.setupCommands ?? "",
    channel: m?.channel ?? "",
    maintainers: (m?.maintainers ?? []).join(", "),
    programTag: m?.programTag ?? "",
  });
  const [newCheck, setNewCheck] = React.useState("");
  const save = async (patch: Record<string, unknown>, quiet = false) => {
    try {
      await postJson("/api/repos", { fullName: repo.fullName, patch }, "PATCH");
      if (!quiet) toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ["repos"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const checklist: ChecklistItem[] = m?.checklist ?? [];
  const open = (items?.rows ?? []).filter((r) => r.state === "open");
  const closed = (items?.rows ?? []).filter((r) => r.state !== "open");

  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto">
      <header className="hero-surface border-line border-b px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <Avatar login={repo.owner} size={40} className="rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <p className="text-ink-subtle font-mono text-[12.5px]">{repo.owner}</p>
            <h2 className="text-[20px] font-semibold">{repo.name}</h2>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <a href={repo.url} target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight />
            </a>
          </Button>
        </div>
        {repo.description ? (
          <p className="text-ink-muted mt-3 font-serif text-[14.5px]">{repo.description}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={!!m?.pinned} onCheckedChange={(v) => void save({ pinned: v }, true)} />{" "}
            Pinned
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={!!m?.muted} onCheckedChange={(v) => void save({ muted: v }, true)} />{" "}
            Muted (hide from Today)
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={!!m?.claRequired}
              onCheckedChange={(v) => void save({ claRequired: v }, true)}
            />{" "}
            CLA
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={!!m?.dcoRequired}
              onCheckedChange={(v) => void save({ dcoRequired: v }, true)}
            />{" "}
            DCO sign-off
          </label>
        </div>
      </header>
      <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
        <section className="space-y-4">
          <h3 className="text-ink-subtle text-[12px] font-semibold tracking-wide uppercase">
            Your notes
          </h3>
          <div className="space-y-1">
            <Label htmlFor="r-notes">Contributing notes (markdown)</Label>
            <Textarea
              id="r-notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className="min-h-32 font-mono text-[12.5px]"
              placeholder="Rules, gotchas, what maintainers like…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-setup">Setup commands</Label>
            <Textarea
              id="r-setup"
              value={draft.setupCommands}
              onChange={(e) => setDraft({ ...draft, setupCommands: e.target.value })}
              className="min-h-20 font-mono text-[12.5px]"
              placeholder="pnpm install&#10;pnpm test"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="r-channel">Channel</Label>
              <Input
                id="r-channel"
                value={draft.channel}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
                placeholder="Discord #contributors"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-program">Program tag</Label>
              <Input
                id="r-program"
                value={draft.programTag}
                onChange={(e) => setDraft({ ...draft, programTag: e.target.value })}
                placeholder="GSoC 2027"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-maint">Maintainers</Label>
            <Input
              id="r-maint"
              value={draft.maintainers}
              onChange={(e) => setDraft({ ...draft, maintainers: e.target.value })}
              placeholder="alice, bob"
              className="font-mono text-[12.5px]"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              void save({
                notes: draft.notes || null,
                setupCommands: draft.setupCommands || null,
                channel: draft.channel || null,
                programTag: draft.programTag || null,
                maintainers: draft.maintainers
                  .split(",")
                  .map((s) => s.trim().replace(/^@/, ""))
                  .filter(Boolean),
              })
            }
          >
            Save notes
          </Button>
          <div>
            <h3 className="text-ink-subtle mb-2 text-[12px] font-semibold tracking-wide uppercase">
              Checklist
            </h3>
            <ul className="space-y-1.5">
              {checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[13.5px]">
                  <Checkbox
                    checked={c.done}
                    onCheckedChange={(v) =>
                      void save(
                        {
                          checklist: checklist.map((x) =>
                            x.id === c.id ? { ...x, done: !!v } : x,
                          ),
                        },
                        true,
                      )
                    }
                    aria-label={c.text}
                  />
                  <span className={cn(c.done && "text-ink-subtle line-through")}>{c.text}</span>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCheck.trim()) return;
                void save(
                  {
                    checklist: [
                      ...checklist,
                      { id: crypto.randomUUID().slice(0, 8), text: newCheck.trim(), done: false },
                    ],
                  },
                  true,
                );
                setNewCheck("");
              }}
            >
              <Input
                value={newCheck}
                onChange={(e) => setNewCheck(e.target.value)}
                placeholder="Add a step…"
                className="h-8 text-[13px]"
                aria-label="New checklist step"
              />
              <Button size="sm" type="submit">
                Add
              </Button>
            </form>
          </div>
          {m?.notes ? (
            <div className="prose-notes border-line bg-surface-2/40 rounded-[12px] border px-4 py-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.notes}</ReactMarkdown>
            </div>
          ) : null}
        </section>
        <section className="space-y-5">
          <div>
            <h3 className="text-ink-subtle mb-2 text-[12px] font-semibold tracking-wide uppercase">
              Your record
            </h3>
            <dl className="grid grid-cols-3 gap-3">
              <Mini label="Merged PRs" value={repo.stats.mergedPrs} />
              <Mini label="Median to merge" value={repo.stats.medianMergeLabel} />
              <Mini
                label="First reply"
                value={
                  repo.stats.medianFirstResponseHours == null
                    ? "—"
                    : `${Math.round(repo.stats.medianFirstResponseHours)}h`
                }
              />
            </dl>
          </div>
          {repo.reviewersOfMe.length ? (
            <div>
              <h3 className="text-ink-subtle mb-2 text-[12px] font-semibold tracking-wide uppercase">
                Reviewed your work
              </h3>
              <ul className="flex flex-wrap gap-2">
                {repo.reviewersOfMe.map((r) => (
                  <li
                    key={r.login}
                    className="border-line inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-[12.5px]"
                  >
                    <Avatar login={r.login} size={22} />
                    <span className="font-mono">@{r.login}</span>
                    <span className="text-ink-subtle tabular">×{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-subtle text-[12px] font-semibold tracking-wide uppercase">
                Open ({open.length})
              </h3>
              <Link
                href={`/items?repo=${encodeURIComponent(repo.fullName)}`}
                className="text-accent-fg text-[12px] hover:underline"
              >
                Table view
              </Link>
            </div>
            {open.map((r) => (
              <ItemLine key={r.id} row={r} />
            ))}
            {open.length === 0 ? (
              <p className="text-ink-muted font-serif text-[13.5px]">Nothing open here.</p>
            ) : null}
          </div>
          {closed.length ? (
            <div>
              <h3 className="text-ink-subtle mb-1 text-[12px] font-semibold tracking-wide uppercase">
                History ({closed.length})
              </h3>
              {closed.slice(0, 12).map((r) => (
                <ItemLine key={r.id} row={r} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
