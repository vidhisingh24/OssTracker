"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, ExternalLink, GraduationCap, Plus, Trash2, Users } from "lucide-react";
import { ORG_STATUS_META, PROGRAM_STATUS_META } from "@contrib/core/derive";
import {
  ORG_STATUSES,
  PROGRAM_STATUSES,
  type ChecklistItem,
  type OrgStatus,
  type ProgramDeadline,
  type ProgramStatus,
} from "@contrib/core/types";
import { postJson, usePrograms, type ProgramView } from "@/lib/api";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Label } from "@/components/ui/input";
import { Checkbox, Select } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Chip, TONE_CLASSES } from "@/components/status";

function useProgramAction() {
  const qc = useQueryClient();
  return async (body: Record<string, unknown>, msg?: string) => {
    try {
      await postJson("/api/programs", body);
      if (msg) toast.success(msg);
      await qc.invalidateQueries({ queryKey: ["programs"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
}

export function ProgramsView() {
  const { data, isLoading } = usePrograms();
  const act = useProgramAction();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  return (
    <div>
      <PageHeader
        title="Programs"
        description="GSoC, LFX and other mentorships — target orgs, proposal progress and deadlines, next to the contributions that back them."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus /> New program
          </Button>
        }
      />
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-[16px]" />
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap />}
            title="No programs yet"
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                Add GSoC 2027
              </Button>
            }
          >
            Track target orgs, proposal status and deadlines for mentorship programs.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {data.map((p) => (
            <ProgramSection key={p.id} p={p} />
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New program">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                { action: "createProgram", data: { name, status: "planning", deadlines: [] } },
                "Program added",
              ).then(() => {
                setCreating(false);
                setName("");
              });
            }}
          >
            <Label htmlFor="prog-name">Name</Label>
            <Input
              id="prog-name"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GSoC 2027"
            />
            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgramSection({ p }: { p: ProgramView }) {
  const act = useProgramAction();
  const [addingOrg, setAddingOrg] = React.useState(false);
  const [org, setOrg] = React.useState({ org: "", displayName: "" });
  const [deadline, setDeadline] = React.useState({ label: "", date: "" });
  const today = new Date().toISOString().slice(0, 10);
  const next = p.deadlines.find((d) => d.date >= today && !d.done);
  const daysToNext = next ? Math.ceil((Date.parse(next.date) - Date.now()) / 86_400_000) : null;
  const statusTone = PROGRAM_STATUS_META[p.status as ProgramStatus]?.tone ?? "neutral";

  const updateDeadlines = (deadlines: ProgramDeadline[]) =>
    void act({ action: "updateProgram", id: p.id, data: { deadlines } });

  return (
    <section className="card overflow-hidden">
      <header className="hero-surface border-line flex flex-wrap items-start gap-4 border-b px-5 py-5 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[20px] font-semibold">{p.name}</h2>
            <Chip tone={statusTone}>
              {PROGRAM_STATUS_META[p.status as ProgramStatus]?.label ?? p.status}
            </Chip>
            {p.url ? (
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-ink-subtle hover:text-ink"
                aria-label="Program website"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
          </div>
          {p.description ? (
            <p className="text-ink-muted mt-1 font-serif text-[14.5px]">{p.description}</p>
          ) : null}
        </div>
        {next ? (
          <div className="border-attention/30 bg-attention-bg rounded-[14px] border px-4 py-2.5 text-right">
            <p className="text-attention-fg text-[11.5px] font-medium">Next: {next.label}</p>
            <p className="text-ink tabular font-mono text-[20px] font-medium">{daysToNext}d</p>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Select
            size="sm"
            ariaLabel="Program status"
            value={p.status}
            onValueChange={(v) =>
              void act({ action: "updateProgram", id: p.id, data: { status: v } })
            }
            options={PROGRAM_STATUSES.map((s) => ({
              value: s,
              label: PROGRAM_STATUS_META[s].label,
            }))}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete program"
            onClick={() =>
              window.confirm(`Delete ${p.name}?`) &&
              void act({ action: "deleteProgram", id: p.id }, "Deleted")
            }
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="border-line border-b px-5 py-4 sm:px-6">
        <h3 className="text-ink-subtle mb-3 flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase">
          <CalendarDays className="size-3.5" /> Deadlines
        </h3>
        <ol
          className="scrollbar-thin relative flex gap-0 overflow-x-auto pb-2"
          aria-label="Deadline timeline"
        >
          {p.deadlines.map((d, i) => {
            const past = d.date < today || d.done;
            const isNext = d.id === next?.id;
            return (
              <li key={d.id} className="relative min-w-40 flex-1 pr-4">
                <div className="flex items-center">
                  <button
                    onClick={() =>
                      updateDeadlines(
                        p.deadlines.map((x) => (x.id === d.id ? { ...x, done: !x.done } : x)),
                      )
                    }
                    aria-label={`${d.label}: mark ${d.done ? "not done" : "done"}`}
                    className={cn(
                      "relative z-10 size-3.5 rounded-full border-2",
                      past
                        ? "border-success bg-success"
                        : isNext
                          ? "border-accent bg-accent"
                          : "border-line-strong bg-surface-1",
                    )}
                  />
                  {i < p.deadlines.length - 1 ? (
                    <span
                      className={cn("h-0.5 flex-1", past ? "bg-success/60" : "bg-line-strong")}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <p className={cn("mt-2 text-[13px] font-medium", past && "text-ink-subtle")}>
                  {d.label}
                </p>
                <p
                  className={cn(
                    "font-mono text-[12px]",
                    isNext ? "text-attention-fg" : "text-ink-subtle",
                  )}
                >
                  {dueLabel(d.date)}
                </p>
              </li>
            );
          })}
        </ol>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!deadline.label || !deadline.date) return;
            updateDeadlines(
              [...p.deadlines, { id: crypto.randomUUID().slice(0, 8), ...deadline }].sort((a, b) =>
                a.date.localeCompare(b.date),
              ),
            );
            setDeadline({ label: "", date: "" });
          }}
        >
          <Input
            value={deadline.label}
            onChange={(e) => setDeadline({ ...deadline, label: e.target.value })}
            placeholder="Deadline label"
            className="h-8 w-48 text-[13px]"
            aria-label="Deadline label"
          />
          <Input
            type="date"
            value={deadline.date}
            onChange={(e) => setDeadline({ ...deadline, date: e.target.value })}
            className="h-8 w-40 text-[13px]"
            aria-label="Deadline date"
          />
          <Button size="sm" type="submit">
            Add deadline
          </Button>
        </form>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-ink-subtle flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase">
            <Users className="size-3.5" /> Target orgs
          </h3>
          <Button size="sm" variant="secondary" onClick={() => setAddingOrg((v) => !v)}>
            <Plus /> Org
          </Button>
        </div>
        {addingOrg ? (
          <form
            className="mb-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                {
                  action: "createOrg",
                  programId: p.id,
                  data: { org: org.org, displayName: org.displayName || null },
                },
                "Org added",
              ).then(() => {
                setOrg({ org: "", displayName: "" });
                setAddingOrg(false);
              });
            }}
          >
            <Input
              required
              value={org.org}
              onChange={(e) => setOrg({ ...org, org: e.target.value })}
              placeholder="GitHub org or owner/repo"
              className="h-8 w-56 font-mono text-[12.5px]"
              aria-label="GitHub org"
            />
            <Input
              value={org.displayName}
              onChange={(e) => setOrg({ ...org, displayName: e.target.value })}
              placeholder="Display name"
              className="h-8 w-48 text-[13px]"
              aria-label="Display name"
            />
            <Button size="sm" type="submit" variant="primary">
              Add
            </Button>
          </form>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {p.orgs.map((o) => (
            <OrgCard key={o.id} o={o} />
          ))}
        </div>
        {p.orgs.length === 0 ? (
          <p className="text-ink-muted font-serif text-[14px]">
            Add the orgs you're targeting. Contributions to their repos are counted automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function OrgCard({ o }: { o: ProgramView["orgs"][number] }) {
  const act = useProgramAction();
  const [step, setStep] = React.useState("");
  const meta = ORG_STATUS_META[o.status as OrgStatus];
  const done = o.checklist.filter((c) => c.done).length;
  const setChecklist = (checklist: ChecklistItem[]) =>
    void act({ action: "updateOrg", id: o.id, data: { checklist } });
  const statusIdx = ORG_STATUSES.indexOf(o.status as OrgStatus);
  return (
    <div className="border-line bg-surface-1 rounded-[14px] border p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{o.displayName ?? o.org}</p>
          <Link
            href={`/items?q=${encodeURIComponent(o.org)}`}
            className="text-ink-subtle font-mono text-[12px] hover:underline"
          >
            {o.org}
          </Link>
        </div>
        <Select
          size="sm"
          ariaLabel={`Status for ${o.org}`}
          value={o.status}
          onValueChange={(v) => void act({ action: "updateOrg", id: o.id, data: { status: v } })}
          options={ORG_STATUSES.map((s) => ({ value: s, label: ORG_STATUS_META[s].label }))}
        />
      </div>
      <div className="mt-3 flex gap-1" aria-label={`Progress: ${meta?.label}`}>
        {ORG_STATUSES.slice(0, 5).map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= statusIdx && o.status !== "rejected"
                ? TONE_CLASSES[meta?.tone ?? "neutral"].dot
                : "bg-surface-3",
            )}
            title={ORG_STATUS_META[s].label}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="bg-surface-2 rounded-[10px] py-1.5">
          <dd className="tabular font-mono text-[16px]">{o.contributions.mergedPrs}</dd>
          <dt className="text-ink-subtle text-[11px]">merged</dt>
        </div>
        <div className="bg-surface-2 rounded-[10px] py-1.5">
          <dd className="tabular font-mono text-[16px]">{o.contributions.openPrs}</dd>
          <dt className="text-ink-subtle text-[11px]">open PRs</dt>
        </div>
        <div className="bg-surface-2 rounded-[10px] py-1.5">
          <dd className="tabular font-mono text-[16px]">{o.contributions.issues}</dd>
          <dt className="text-ink-subtle text-[11px]">issues</dt>
        </div>
      </dl>
      {o.mentors.length ? (
        <p className="text-ink-muted mt-3 text-[12.5px]">
          Mentors: <span className="font-mono">{o.mentors.map((m) => `@${m}`).join(", ")}</span>
        </p>
      ) : null}
      {o.notes ? <p className="text-ink-muted mt-2 font-serif text-[13.5px]">{o.notes}</p> : null}
      <div className="mt-3">
        <p className="text-ink-subtle mb-1.5 text-[11.5px] font-medium">
          Checklist{" "}
          <span className="tabular font-mono">
            {done}/{o.checklist.length}
          </span>
        </p>
        <ul className="space-y-1">
          {o.checklist.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={c.done}
                aria-label={c.text}
                onCheckedChange={(v) =>
                  setChecklist(o.checklist.map((x) => (x.id === c.id ? { ...x, done: !!v } : x)))
                }
              />
              <span className={cn("flex-1", c.done && "text-ink-subtle line-through")}>
                {c.text}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!step.trim()) return;
            setChecklist([
              ...o.checklist,
              { id: crypto.randomUUID().slice(0, 8), text: step.trim(), done: false },
            ]);
            setStep("");
          }}
        >
          <Input
            value={step}
            onChange={(e) => setStep(e.target.value)}
            placeholder="Add a step…"
            className="h-7 text-[12.5px]"
            aria-label={`Add checklist step for ${o.org}`}
          />
        </form>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {o.proposalUrl ? (
          <a
            href={o.proposalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent-fg text-[12.5px] font-medium hover:underline"
          >
            Proposal ↗
          </a>
        ) : null}
        {o.links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="text-ink-muted text-[12.5px] hover:underline"
          >
            {l.label} ↗
          </a>
        ))}
        <button
          className="text-ink-subtle hover:text-danger-fg ml-auto"
          aria-label={`Remove ${o.org}`}
          onClick={() =>
            window.confirm(`Remove ${o.org}?`) && void act({ action: "deleteOrg", id: o.id })
          }
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
