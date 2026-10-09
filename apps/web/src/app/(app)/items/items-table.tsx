"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  Download,
  Flag,
  Pin,
  Rows3,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { ItemRow } from "@contrib/core/types";
import { PRIORITIES } from "@contrib/core/types";
import { fetchJson, postJson, useFacets, useItems } from "@/lib/api";
import { relative, shortDate, slug, snoozeOptions } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
  BallBadge,
  CiBadge,
  KindIcon,
  PriorityBadge,
  ReasonChip,
  ReviewerStack,
  StageBadge,
  TagPill,
} from "@/components/status";
import { FilterBar, useUrlFilters } from "@/components/items/filter-bar";
import { useOpenItem } from "@/components/items/item-card";

const ALL_COLUMNS = [
  "item",
  "stage",
  "ball",
  "ci",
  "attention",
  "reviewers",
  "priority",
  "tags",
  "updated",
  "created",
] as const;
type Col = (typeof ALL_COLUMNS)[number];
const DEFAULT_COLS: Col[] = ["item", "stage", "ball", "ci", "reviewers", "priority", "updated"];
const COL_LABEL: Record<Col, string> = {
  item: "Item",
  stage: "Stage",
  ball: "Waiting on",
  ci: "CI",
  attention: "Attention",
  reviewers: "Reviewers",
  priority: "Priority",
  tags: "Tags",
  updated: "Updated",
  created: "Created",
};
const SORT_FOR: Partial<Record<Col, string>> = {
  item: "title",
  stage: "stage",
  attention: "attention",
  priority: "priority",
  updated: "updated",
  created: "created",
};

export function ItemsTable() {
  const { sp, set, apiQuery } = useUrlFilters();
  const query = React.useMemo(() => {
    const p = new URLSearchParams(apiQuery);
    if (!p.get("pageSize")) p.set("pageSize", "100");
    return p.toString();
  }, [apiQuery]);
  const { data, isLoading, isFetching } = useItems(query);
  const open = useOpenItem();
  const qc = useQueryClient();
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const cols = (sp
    .get("cols")
    ?.split(",")
    .filter((c): c is Col => (ALL_COLUMNS as readonly string[]).includes(c)) ??
    DEFAULT_COLS) as Col[];
  const sort = sp.get("sort") ?? "updated";
  const dir = sp.get("dir") ?? "desc";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = 100;

  React.useEffect(() => setSelection({}), [apiQuery]);

  const columns = React.useMemo<ColumnDef<ItemRow>[]>(() => {
    const defs: Record<Col, ColumnDef<ItemRow>> = {
      item: {
        id: "item",
        size: 520,
        cell: ({ row: { original: r } }) => (
          <div className="flex min-w-0 items-start gap-2.5">
            <KindIcon kind={r.kind} state={r.state} isDraft={r.isDraft} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-ink truncate text-[13.5px] font-medium">{r.title}</p>
              <p className="text-ink-subtle flex items-center gap-1.5 truncate font-mono text-[11.5px]">
                {slug(r.repoFullName, r.number)}
                {r.meta.pinned ? (
                  <Pin className="text-accent size-3 fill-current" aria-label="pinned" />
                ) : null}
                {r.meta.archived ? <Archive className="size-3" aria-label="archived" /> : null}
              </p>
            </div>
          </div>
        ),
      },
      stage: {
        id: "stage",
        size: 170,
        cell: ({ row: { original: r } }) => (
          <StageBadge stage={r.effectiveStage} overridden={!!r.meta.personalStage} size="xs" />
        ),
      },
      ball: {
        id: "ball",
        size: 190,
        cell: ({ row: { original: r } }) =>
          r.state === "open" ? (
            <BallBadge ball={r.effectiveBall} size="xs" />
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      ci: {
        id: "ci",
        size: 70,
        cell: ({ row: { original: r } }) =>
          r.kind === "pr" ? (
            <CiBadge ci={r.ciState} compact />
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      attention: {
        id: "attention",
        size: 200,
        cell: ({ row: { original: r } }) =>
          r.attentionReasons[0] ? (
            <ReasonChip reason={r.attentionReasons[0]} size="xs" />
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      reviewers: {
        id: "reviewers",
        size: 120,
        cell: ({ row: { original: r } }) => (
          <ReviewerStack reviewers={r.reviewers} size={20} max={3} />
        ),
      },
      priority: {
        id: "priority",
        size: 80,
        cell: ({ row: { original: r } }) => <PriorityBadge priority={r.meta.priority} />,
      },
      tags: {
        id: "tags",
        size: 180,
        cell: ({ row: { original: r } }) => (
          <div className="flex gap-1 overflow-hidden">
            {r.meta.tags.slice(0, 3).map((t) => (
              <TagPill key={t} tag={t} />
            ))}
          </div>
        ),
      },
      updated: {
        id: "updated",
        size: 100,
        cell: ({ row: { original: r } }) => (
          <span className="text-ink-muted tabular text-[12.5px]" title={r.ghUpdatedAt ?? ""}>
            {relative(r.ghUpdatedAt)}
          </span>
        ),
      },
      created: {
        id: "created",
        size: 100,
        cell: ({ row: { original: r } }) => (
          <span className="text-ink-muted tabular text-[12.5px]">{shortDate(r.ghCreatedAt)}</span>
        ),
      },
    };
    return [
      {
        id: "select",
        size: 40,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(c) => table.toggleAllRowsSelected(!!c)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(c) => row.toggleSelected(!!c)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      ...cols.map((c) => ({ ...defs[c], header: COL_LABEL[c] })),
    ];
  }, [cols]);

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    getRowId: (r) => r.id,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const parentRef = React.useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });
  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const grid = `40px ${cols.map((c) => (c === "item" ? "minmax(280px,1fr)" : `${columns.find((x) => x.id === c)?.size ?? 120}px`)).join(" ")}`;

  const bulk = async (op: Record<string, unknown>, label: string) => {
    try {
      const res = await postJson<{ updated: number }>("/api/items/bulk", { ids: selectedIds, op });
      toast.success(`${label} · ${res.updated} item${res.updated === 1 ? "" : "s"}`);
      setSelection({});
      void qc.invalidateQueries({ queryKey: ["items"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleSort = (c: Col) => {
    const key = SORT_FOR[c];
    if (!key) return;
    set({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" });
  };

  return (
    <div>
      <PageHeader
        title="All items"
        description={
          isLoading ? "Loading…" : `${total.toLocaleString()} item${total === 1 ? "" : "s"} match`
        }
        actions={
          <>
            <SavedViews />
            <ColumnChooser
              cols={cols}
              onChange={(next) =>
                set({ cols: next.join(",") === DEFAULT_COLS.join(",") ? null : next })
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <a href={`/api/items/export?format=csv&${apiQuery}`}>CSV (current filters)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/items/export?format=json&${apiQuery}`}>JSON (current filters)</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <FilterBar
        extra={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Archived: {sp.get("archived") ?? "hide"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(["exclude", "include", "only"] as const).map((v) => (
                <DropdownMenuItem
                  key={v}
                  onSelect={() => set({ archived: v === "exclude" ? null : v })}
                >
                  {v === "exclude"
                    ? "Hide archived"
                    : v === "include"
                      ? "Include archived"
                      : "Only archived"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {selectedIds.length ? (
        <div className="border-accent/40 bg-attention-bg sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border px-3 py-2 shadow-md">
          <span className="text-attention-fg text-[13px] font-medium">
            {selectedIds.length} selected
          </span>
          <BulkTag
            onApply={(tag) => void bulk({ type: "addTags", tags: [tag] }, `Tagged #${tag}`)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                <Flag /> Priority
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onSelect={() => void bulk({ type: "priority", value: p }, `Priority ${p}`)}
                >
                  {p}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onSelect={() => void bulk({ type: "priority", value: null }, "Priority cleared")}
              >
                None
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                <Clock3 /> Snooze
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {snoozeOptions().map((o) => (
                <DropdownMenuItem
                  key={o.label}
                  onSelect={() => void bulk({ type: "snooze", until: o.iso }, "Snoozed")}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onSelect={() => void bulk({ type: "snooze", until: null }, "Unsnoozed")}
              >
                Unsnooze
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void bulk(
                { type: "archive", value: sp.get("archived") !== "only" },
                sp.get("archived") === "only" ? "Unarchived" : "Archived",
              )
            }
          >
            <Archive /> {sp.get("archived") === "only" ? "Unarchive" : "Archive"}
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelection({})}>
            <X /> Clear
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div
          ref={parentRef}
          className="scrollbar-thin max-h-[calc(100dvh-260px)] min-h-80 overflow-auto"
          role="table"
          aria-label="Items"
          aria-rowcount={total}
          aria-busy={isFetching}
        >
          <div className="min-w-[860px]">
            <div
              role="row"
              className="border-line bg-surface-2/95 text-ink-subtle sticky top-0 z-[1] grid items-center gap-3 border-b px-4 py-2 text-[11.5px] font-medium tracking-wide uppercase backdrop-blur"
              style={{ gridTemplateColumns: grid }}
            >
              {table.getHeaderGroups()[0]!.headers.map((h) => {
                const c = h.column.id as Col;
                const sortable = !!SORT_FOR[c];
                const activeSort = SORT_FOR[c] === sort;
                return (
                  <div
                    role="columnheader"
                    key={h.id}
                    aria-sort={
                      activeSort ? (dir === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(c)}
                        className={cn(
                          "hover:text-ink inline-flex items-center gap-1 uppercase",
                          activeSort && "text-ink",
                        )}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {activeSort ? (
                          dir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </div>
                );
              })}
            </div>
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState icon={<Rows3 />} title="No items match">
                Loosen a filter, or add something with the Add button — any GitHub URL works.
              </EmptyState>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const row = rows[v.index]!;
                  return (
                    <div
                      key={row.id}
                      role="row"
                      data-item-id={row.id}
                      tabIndex={0}
                      onClick={() => open(row.id)}
                      onKeyDown={(e) => e.key === "Enter" && open(row.id)}
                      className={cn(
                        "border-line hover:bg-surface-2/60 data-[selected]:bg-surface-2 absolute inset-x-0 grid cursor-pointer items-center gap-3 border-b px-4 transition-colors",
                        row.getIsSelected() && "bg-attention-bg/50",
                      )}
                      style={{
                        gridTemplateColumns: grid,
                        height: v.size,
                        transform: `translateY(${v.start}px)`,
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <div role="cell" key={cell.id} className="min-w-0">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {pages > 1 ? (
          <div className="border-line text-ink-muted flex items-center justify-between border-t px-4 py-2 text-[12.5px]">
            <span className="tabular">
              Page {page} of {pages}
            </span>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => set({ page: String(page - 1) })}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={page >= pages}
                onClick={() => set({ page: String(page + 1) })}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ColumnChooser({ cols, onChange }: { cols: Col[]; onChange: (c: Col[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Columns3 /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        {ALL_COLUMNS.filter((c) => c !== "item").map((c) => (
          <DropdownMenuCheckboxItem
            key={c}
            checked={cols.includes(c)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) =>
              onChange(ALL_COLUMNS.filter((x) => (x === c ? on : cols.includes(x))))
            }
          >
            {COL_LABEL[c]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkTag({ onApply }: { onApply: (tag: string) => void }) {
  const [tag, setTag] = React.useState("");
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const t = tag.trim().replace(/^#/, "").toLowerCase();
        if (t) onApply(t);
        setTag("");
      }}
    >
      <div className="relative">
        <Tag className="text-ink-subtle pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="tag"
          aria-label="Tag to add"
          className="border-line-strong bg-surface-1 focus:border-accent h-8 w-28 rounded-[10px] border pr-2 pl-7 font-mono text-[12px] outline-none"
        />
      </div>
      <Button size="sm" variant="secondary" type="submit">
        Tag
      </Button>
    </form>
  );
}

function SavedViews() {
  const { data } = useFacets();
  const { apiQuery, sp } = useUrlFilters();
  const qc = useQueryClient();
  const views = (data?.views ?? []).filter((v) => v.page === "items");
  const save = async () => {
    const name = window.prompt("Name this view");
    if (!name) return;
    const p = new URLSearchParams(apiQuery);
    if (sp.get("cols")) p.set("cols", sp.get("cols")!);
    await postJson("/api/views", { name, page: "items", query: p.toString() });
    void qc.invalidateQueries({ queryKey: ["meta"] });
    toast.success("View saved");
  };
  const remove = async (id: string) => {
    await fetchJson(`/api/views?id=${id}`, { method: "DELETE" });
    void qc.invalidateQueries({ queryKey: ["meta"] });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Bookmark /> Views
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Built-in</DropdownMenuLabel>
        {[
          ["My open PRs", "kind=pr&state=open&relation=author"],
          ["Needs me", "ball=you&state=open&sort=attention"],
          ["Waiting on maintainers", "ball=maintainer,ci&state=open&sort=activity&dir=asc"],
          ["Merged", "state=merged&sort=updated"],
          ["Stale", "stage=stale"],
          ["Planned", "source=planned"],
        ].map(([name, q]) => (
          <DropdownMenuItem key={name} asChild>
            <a href={`/items?${q}`}>{name}</a>
          </DropdownMenuItem>
        ))}
        {views.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Saved</DropdownMenuLabel>
            {views.map((v) => (
              <DropdownMenuItem key={v.id} asChild>
                <a href={`/items?${v.query}`} className="flex w-full items-center">
                  <span className="flex-1 truncate">{v.name}</span>
                  <button
                    aria-label={`Delete view ${v.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void remove(v.id);
                    }}
                    className="text-ink-subtle hover:text-danger-fg"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </a>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void save()}>
          <Bookmark /> Save current filters…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
