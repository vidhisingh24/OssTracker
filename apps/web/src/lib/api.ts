"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ItemMeta, ItemRow, Settings } from "@contrib/core/types";
import type {
  ActivityEntry,
  InboxEntry,
  Insights,
  ItemDetail,
  ProgramView,
  RepoCard,
  SyncStatus,
  TodayData,
} from "@contrib/core/queries";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export type {
  ActivityEntry,
  InboxEntry,
  Insights,
  ItemDetail,
  ProgramView,
  RepoCard,
  SyncStatus,
  TodayData,
};

export interface Facets {
  facets: { repos: string[]; labels: string[]; tags: string[]; programs: string[] };
  views: { id: string; name: string; page: string; query: string }[];
}

export const keys = {
  today: ["today"] as const,
  items: (q: string) => ["items", q] as const,
  item: (id: string) => ["item", id] as const,
  meta: ["meta"] as const,
  repos: ["repos"] as const,
  programs: ["programs"] as const,
  inbox: (q: string) => ["inbox", q] as const,
  unread: ["unread"] as const,
  insights: ["insights"] as const,
  sync: ["sync"] as const,
  syncRuns: ["sync", "runs"] as const,
  settings: ["settings"] as const,
};

export const useToday = () =>
  useQuery({
    queryKey: keys.today,
    queryFn: () => fetchJson<TodayData>("/api/today"),
    refetchInterval: 60_000,
  });

export const useItems = (query: string, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: keys.items(query),
    queryFn: () => fetchJson<{ rows: ItemRow[]; total: number }>(`/api/items?${query}`),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });

export const useItem = (id: string | null) =>
  useQuery({
    queryKey: keys.item(id ?? ""),
    queryFn: () => fetchJson<ItemDetail>(`/api/items/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });

export const useFacets = () =>
  useQuery({
    queryKey: keys.meta,
    queryFn: () => fetchJson<Facets>("/api/meta"),
    staleTime: 60_000,
  });
export const useRepos = () =>
  useQuery({ queryKey: keys.repos, queryFn: () => fetchJson<RepoCard[]>("/api/repos") });
export const usePrograms = () =>
  useQuery({ queryKey: keys.programs, queryFn: () => fetchJson<ProgramView[]>("/api/programs") });
export const useInsights = () =>
  useQuery({
    queryKey: keys.insights,
    queryFn: () => fetchJson<Insights>("/api/insights"),
    staleTime: 5 * 60_000,
  });

export const useInbox = (query: string) =>
  useQuery({
    queryKey: keys.inbox(query),
    queryFn: () =>
      fetchJson<{
        entries: InboxEntry[];
        nextCursor: string | null;
        counts: Record<string, number>;
      }>(`/api/inbox?${query}`),
    placeholderData: keepPreviousData,
  });

export type SyncStatusResponse = SyncStatus & {
  runs: SyncRun[];
  mode: "demo" | "worker" | "inline";
};
export interface SyncRun {
  id: string;
  kind: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsTouched: number;
  eventsCreated: number;
  apiCost: number;
  rateRemaining: number | null;
  error: string | null;
  errors: { scope: string; message: string }[];
  progress: { phase: string; done: number; total: number; message?: string };
}

export const useSyncStatus = (opts: { runs?: boolean } = {}) =>
  useQuery({
    queryKey: opts.runs ? keys.syncRuns : keys.sync,
    queryFn: () => fetchJson<SyncStatusResponse>(`/api/sync${opts.runs ? "?runs=1" : ""}`),
    refetchInterval: (q) => ((q.state.data?.running.length ?? 0) > 0 ? 1200 : 30_000),
  });

export interface SettingsResponse {
  settings: Settings;
  connection: {
    mode: "demo" | "live";
    authEnabled: boolean;
    account: {
      login: string;
      name: string | null;
      avatarUrl: string | null;
      scopes: string | null;
      tokenUpdatedAt: string;
    } | null;
    patConfigured: boolean;
    requestedScopes: string[];
    dbDriver: string;
    webhooksEnabled: boolean;
  };
  channels: { email: boolean; telegram: boolean; ntfy: boolean };
}
export const useSettings = () =>
  useQuery({
    queryKey: keys.settings,
    queryFn: () => fetchJson<SettingsResponse>("/api/settings"),
  });

/* ───────────── Mutations ───────────── */

function patchRows(
  rows: ItemRow[] | undefined,
  id: string,
  meta: Partial<ItemMeta>,
): ItemRow[] | undefined {
  return rows?.map((r) =>
    r.id === id
      ? {
          ...r,
          meta: { ...r.meta, ...meta },
          effectiveStage:
            meta.personalStage !== undefined ? (meta.personalStage ?? r.stage) : r.effectiveStage,
          effectiveBall:
            meta.ballOverride !== undefined ? (meta.ballOverride ?? r.ball) : r.effectiveBall,
        }
      : r,
  );
}

/** Optimistic per-item meta update across every cached list. */
export function useUpdateMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ItemMeta> }) =>
      fetchJson<{ meta: ItemMeta }>(`/api/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: patch,
      }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      const snapshots: [QueryKey, unknown][] = [];
      for (const [key, data] of qc.getQueriesData<{ rows: ItemRow[]; total: number }>({
        queryKey: ["items"],
      })) {
        snapshots.push([key, data]);
        if (data) qc.setQueryData(key, { ...data, rows: patchRows(data.rows, id, patch) });
      }
      const today = qc.getQueryData<TodayData>(keys.today);
      if (today) {
        snapshots.push([keys.today, today]);
        qc.setQueryData(keys.today, {
          ...today,
          needsYou: patchRows(today.needsYou, id, patch),
          waiting: patchRows(today.waiting, id, patch),
        });
      }
      const detail = qc.getQueryData<ItemDetail>(keys.item(id));
      if (detail) {
        snapshots.push([keys.item(id), detail]);
        qc.setQueryData(keys.item(id), { ...detail, row: patchRows([detail.row], id, patch)![0] });
      }
      return { snapshots };
    },
    onError: (err, _v, ctx) => {
      for (const [k, d] of ctx?.snapshots ?? []) qc.setQueryData(k, d);
      toast.error("Couldn't save", { description: (err as Error).message });
    },
    onSettled: (_d, _e, { id, patch }) => {
      if (Object.keys(patch).length === 1 && "lastViewedAt" in patch) {
        void qc.invalidateQueries({ queryKey: keys.unread });
        return;
      }
      void qc.invalidateQueries({ queryKey: ["items"] });
      void qc.invalidateQueries({ queryKey: keys.today });
      void qc.invalidateQueries({ queryKey: keys.item(id) });
    },
  });
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export async function postJson<T>(url: string, json: unknown, method = "POST"): Promise<T> {
  return fetchJson<T>(url, { method, json });
}
