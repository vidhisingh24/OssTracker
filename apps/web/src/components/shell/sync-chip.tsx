"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, RefreshCw } from "lucide-react";
import { postJson, useSyncStatus } from "@/lib/api";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function SyncChip() {
  const { data } = useSyncStatus();
  const qc = useQueryClient();
  const running = data?.running[0];
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running)
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "sync" });
    wasRunning.current = !!running;
  }, [running, qc]);

  const gql = data?.rate.find((r) => r.resource === "graphql");
  const quotaPct = gql ? gql.remaining / gql.limit : null;
  const failed = !!data?.lastFailure;
  const syncNow = async () => {
    try {
      await postJson("/api/sync", { kind: "cold" });
      toast.success(data?.mode === "worker" ? "Sync queued" : "Sync started");
      void qc.invalidateQueries({ queryKey: ["sync"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const pct =
    running && running.progress.total
      ? Math.round((running.progress.done / running.progress.total) * 100)
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
            failed
              ? "border-danger/30 bg-danger-bg text-danger-fg"
              : "border-line bg-surface-1 text-ink-muted hover:text-ink",
          )}
          aria-label="Sync status"
        >
          {running ? (
            <Loader2 className="text-accent size-3.5 animate-spin" />
          ) : failed ? (
            <AlertTriangle className="size-3.5" />
          ) : (
            <CheckCircle2 className="text-success size-3.5" />
          )}
          <span className="tabular hidden sm:inline">
            {running
              ? pct != null
                ? `Syncing ${pct}%`
                : "Syncing…"
              : data?.lastSuccessAt
                ? relative(data.lastSuccessAt)
                : "Not synced"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] font-semibold">Sync</p>
            <span className="bg-surface-2 text-ink-muted rounded-full px-2 py-0.5 text-[11px]">
              {data?.mode === "demo" ? "demo" : data?.mode === "worker" ? "worker" : "in-process"}
            </span>
          </div>
          {running ? (
            <div>
              <div className="text-ink-muted mb-1 flex justify-between text-[12px]">
                <span className="capitalize">
                  {running.kind} · {running.progress.phase}
                </span>
                <span className="tabular">
                  {running.progress.done}/{running.progress.total}
                </span>
              </div>
              <div
                className="bg-surface-3 h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={pct ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="bg-accent h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${pct ?? 10}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-ink-muted text-[12.5px]">
              Last successful sync {data?.lastSuccessAt ? relative(data.lastSuccessAt) : "never"}.
            </p>
          )}
          {failed ? (
            <p className="text-danger-fg text-[12.5px]">
              Last run failed: {data?.lastFailure?.error}
            </p>
          ) : null}
          {gql ? (
            <div>
              <div className="text-ink-muted mb-1 flex items-center justify-between text-[12px]">
                <span className="inline-flex items-center gap-1">
                  <Gauge className="size-3.5" /> GraphQL quota
                </span>
                <span className="tabular font-mono">
                  {gql.remaining.toLocaleString()} / {gql.limit.toLocaleString()}
                </span>
              </div>
              <div className="bg-surface-3 h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    quotaPct! < 0.15 ? "bg-danger" : quotaPct! < 0.4 ? "bg-warning" : "bg-success",
                  )}
                  style={{ width: `${Math.round(quotaPct! * 100)}%` }}
                />
              </div>
              <p className="text-ink-subtle mt-1 text-[11.5px]">Resets {relative(gql.resetAt)}</p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={syncNow}
              disabled={!!running}
            >
              <RefreshCw /> Sync now
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/sync">Log</Link>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
