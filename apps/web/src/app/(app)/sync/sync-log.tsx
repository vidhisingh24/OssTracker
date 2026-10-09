"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, RefreshCw, RotateCcw } from "lucide-react";
import { postJson, useSyncStatus, type SyncRun } from "@/lib/api";
import { fullDate, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/status";

const STATUS_TONE = {
  success: "success",
  partial: "warning",
  failed: "danger",
  running: "info",
  queued: "neutral",
} as const;

export function SyncLog() {
  const { data, isLoading } = useSyncStatus({ runs: true });
  const qc = useQueryClient();
  const [open, setOpen] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<string>("all");

  const trigger = async (k: string) => {
    try {
      await postJson("/api/sync", { kind: k });
      toast.success(
        `${k[0]!.toUpperCase()}${k.slice(1)} sync ${data?.mode === "worker" ? "queued" : "started"}`,
      );
      void qc.invalidateQueries({ queryKey: ["sync"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const runs = (data?.runs ?? []).filter((r) => kind === "all" || r.kind === kind);
  const gql = data?.rate.find((r) => r.resource === "graphql");
  const cost24h = (data?.runs ?? [])
    .filter((r) => Date.now() - Date.parse(r.startedAt) < 86_400_000)
    .reduce((s, r) => s + r.apiCost, 0);

  return (
    <div>
      <PageHeader
        title="Sync log"
        description="Every run: what it touched, what it cost, what went wrong."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void trigger("notifications")}>
              Poll notifications
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void trigger("cold")}
              disabled={!!data?.running.length}
            >
              <RefreshCw className={cn(data?.running.length && "animate-spin")} /> Sync now
            </Button>
          </>
        }
      />
      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Mode"
          value={
            data?.mode === "demo"
              ? "Demo"
              : data?.mode === "worker"
                ? "Worker + queue"
                : "In-process"
          }
        />
        <Stat
          label="Last success"
          value={data?.lastSuccessAt ? relative(data.lastSuccessAt) : "never"}
        />
        <Stat
          label="GraphQL quota"
          value={gql ? `${gql.remaining.toLocaleString()} / ${gql.limit.toLocaleString()}` : "—"}
        />
        <Stat label="Points used (24h)" value={cost24h.toLocaleString()} />
      </dl>
      {data?.running.map((r) => (
        <Card key={r.id} className="mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px]">
            <RefreshCw className="text-accent size-4 animate-spin" />
            <span className="font-medium capitalize">{r.kind} sync running</span>
            <span className="text-ink-subtle">· {r.progress.phase}</span>
            <span className="text-ink-muted tabular ml-auto font-mono">
              {r.progress.done}/{r.progress.total}
            </span>
          </div>
          <div className="bg-surface-3 h-2 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${r.progress.total ? (r.progress.done / r.progress.total) * 100 : 8}%`,
              }}
            />
          </div>
          {r.progress.message ? (
            <p className="text-ink-subtle mt-2 truncate font-mono text-[12px]">
              {r.progress.message}
            </p>
          ) : null}
        </Card>
      ))}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {["all", "cold", "hot", "warm", "notifications", "item", "demo"].map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "subtle" : "ghost"}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className="capitalize"
          >
            {k}
          </Button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="border-line bg-surface-2/60 text-ink-subtle border-b text-left text-[11.5px] tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Run</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 text-right font-medium">Duration</th>
                  <th className="px-4 py-2 text-right font-medium">Items</th>
                  <th className="px-4 py-2 text-right font-medium">Events</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {runs.map((r) => (
                  <RunRow
                    key={r.id}
                    r={r}
                    open={open === r.id}
                    onToggle={() => setOpen(open === r.id ? null : r.id)}
                    onRetry={() =>
                      void trigger(r.kind === "item" || r.kind === "demo" ? "cold" : r.kind)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <dt className="text-ink-subtle text-[12px]">{label}</dt>
      <dd className="tabular mt-0.5 font-mono text-[16px]">{value}</dd>
    </div>
  );
}

function RunRow({
  r,
  open,
  onToggle,
  onRetry,
}: {
  r: SyncRun;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const dur = r.finishedAt ? (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000 : null;
  const hasDetail = !!r.error || r.errors.length > 0;
  return (
    <>
      <tr
        className={cn("hover:bg-surface-2/50 transition-colors", hasDetail && "cursor-pointer")}
        onClick={hasDetail ? onToggle : undefined}
      >
        <td className="px-4 py-2.5">
          <span className="font-medium capitalize">{r.kind}</span>{" "}
          <span className="text-ink-subtle text-[12px]">· {r.trigger}</span>
        </td>
        <td className="px-4 py-2.5">
          <Chip size="xs" tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>
            {r.status}
          </Chip>
        </td>
        <td className="text-ink-muted tabular px-4 py-2.5" title={fullDate(r.startedAt)}>
          {relative(r.startedAt)}
        </td>
        <td className="tabular px-4 py-2.5 text-right font-mono">
          {dur == null ? "—" : dur < 60 ? `${dur.toFixed(1)}s` : `${Math.round(dur / 60)}m`}
        </td>
        <td className="tabular px-4 py-2.5 text-right font-mono">{r.itemsTouched}</td>
        <td className="tabular px-4 py-2.5 text-right font-mono">{r.eventsCreated}</td>
        <td className="tabular px-4 py-2.5 text-right font-mono">{r.apiCost}</td>
        <td className="px-4 py-2.5 text-right">
          {r.status === "failed" || r.status === "partial" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
            >
              <RotateCcw /> Retry
            </Button>
          ) : null}
          {hasDetail ? (
            <ChevronDown
              className={cn(
                "text-ink-subtle inline size-4 transition-transform",
                open && "rotate-180",
              )}
            />
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={8} className="bg-surface-2/40 px-4 py-3">
            {r.error ? <p className="text-danger-fg mb-2 text-[13px]">{r.error}</p> : null}
            <ul className="space-y-1">
              {r.errors.map((e, i) => (
                <li key={i} className="text-ink-muted font-mono text-[12px]">
                  <span className="text-ink">{e.scope}</span> — {e.message}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}
