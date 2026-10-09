"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Rows2, Columns3 } from "lucide-react";
import { STAGE_META } from "@contrib/core/derive";
import { STAGES, type ItemRow, type Stage } from "@contrib/core/types";
import { useItems, useUpdateMeta } from "@/lib/api";
import { relative, slug } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CiBadge,
  KindIcon,
  PriorityBadge,
  ReasonChip,
  ReviewerStack,
  STAGE_ICONS,
  TONE_CLASSES,
} from "@/components/status";
import { FilterBar, useUrlFilters } from "@/components/items/filter-bar";
import { useOpenItem } from "@/components/items/item-card";

const CLOSED_WINDOW_DAYS = 30;

export function PipelineBoard() {
  const { sp, set, apiQuery } = useUrlFilters();
  const query = React.useMemo(() => {
    const p = new URLSearchParams(apiQuery);
    p.set("pageSize", "1000");
    p.set("sort", "attention");
    return p.toString();
  }, [apiQuery]);
  const { data, isLoading } = useItems(query);
  const update = useUpdateMeta();
  const lanes = sp.get("lanes") === "repo";
  const [active, setActive] = React.useState<ItemRow | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const rows = React.useMemo(() => {
    const cutoff = Date.now() - CLOSED_WINDOW_DAYS * 86_400_000;
    return (data?.rows ?? []).filter(
      (r) =>
        r.state === "open" ||
        Date.parse(r.closedAt ?? r.mergedAt ?? r.ghUpdatedAt ?? "") > cutoff ||
        !!r.meta.personalStage,
    );
  }, [data]);
  const repos = React.useMemo(
    () => (lanes ? [...new Set(rows.map((r) => r.repoFullName))].sort() : [null]),
    [rows, lanes],
  );

  const onDragStart = (e: DragStartEvent) =>
    setActive(rows.find((r) => r.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const row = rows.find((r) => r.id === e.active.id);
    const target = (e.over?.data.current as { stage?: Stage } | undefined)?.stage;
    if (!row || !target || target === row.effectiveStage) return;
    const auto = target === row.stage;
    update.mutate(
      { id: row.id, patch: { personalStage: auto ? null : target } },
      {
        onSuccess: () =>
          toast(
            auto
              ? `Back to automatic stage (${STAGE_META[target].label})`
              : `Moved to ${STAGE_META[target].label}`,
            {
              description: auto ? undefined : "Manual override — sync won't change it.",
              action: {
                label: "Undo",
                onClick: () =>
                  update.mutate({ id: row.id, patch: { personalStage: row.meta.personalStage } }),
              },
            },
          ),
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Every item by stage. Drag a card to override its stage; drop it back on its automatic column to clear the override."
        actions={
          <div
            className="border-line bg-surface-2 inline-flex rounded-[10px] border p-0.5"
            role="radiogroup"
            aria-label="Layout"
          >
            <Button
              variant="ghost"
              size="sm"
              role="radio"
              aria-checked={!lanes}
              className={cn(!lanes && "bg-surface-1 text-ink shadow-sm")}
              onClick={() => set({ lanes: null })}
            >
              <Columns3 /> Board
            </Button>
            <Button
              variant="ghost"
              size="sm"
              role="radio"
              aria-checked={lanes}
              className={cn(lanes && "bg-surface-1 text-ink shadow-sm")}
              onClick={() => set({ lanes: "repo" })}
            >
              <Rows2 /> By repo
            </Button>
          </div>
        }
      />
      <FilterBar hide={["stage", "state"]} />
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-[16px]" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActive(null)}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Press space to pick up a card, arrow keys to move, space again to drop on a stage column.",
            },
          }}
        >
          <div className="space-y-6">
            {repos.map((repo) => {
              const laneRows = repo ? rows.filter((r) => r.repoFullName === repo) : rows;
              return (
                <section key={repo ?? "all"} aria-label={repo ?? "All repos"}>
                  {repo ? (
                    <h2 className="text-ink-muted mb-2 font-mono text-[13px] font-medium">
                      {repo}
                    </h2>
                  ) : null}
                  <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
                    {STAGES.map((stage) => (
                      <Column
                        key={stage}
                        stage={stage}
                        lane={repo}
                        rows={laneRows.filter((r) => r.effectiveStage === stage)}
                        compact={!!repo}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
            {active ? <KanbanCard row={active} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({
  stage,
  rows,
  lane,
  compact,
}: {
  stage: Stage;
  rows: ItemRow[];
  lane: string | null;
  compact: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${lane ?? "all"}:${stage}`, data: { stage } });
  const meta = STAGE_META[stage];
  const Icon = STAGE_ICONS[stage];
  if (compact && rows.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "border-line w-10 shrink-0 rounded-[14px] border border-dashed transition-colors",
          isOver && "border-accent bg-attention-bg/40 w-64",
        )}
        title={meta.label}
      />
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-line bg-surface-2/50 flex w-[272px] shrink-0 flex-col rounded-[16px] border transition-colors duration-150",
        isOver && "border-accent/60 bg-attention-bg/40",
      )}
      aria-label={`${meta.label}, ${rows.length} items`}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Icon className={cn("size-4", TONE_CLASSES[meta.tone].text)} aria-hidden />
        <h3 className="text-[13px] font-semibold">{meta.label}</h3>
        <span className="text-ink-subtle tabular ml-auto font-mono text-[12px]">{rows.length}</span>
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 px-2 pb-2",
          !compact && "scrollbar-thin max-h-[calc(100dvh-300px)] min-h-24 overflow-y-auto",
        )}
      >
        {rows.map((r) => (
          <DraggableCard key={r.id} row={r} />
        ))}
        {rows.length === 0 ? (
          <p className="text-ink-subtle px-2 py-6 text-center font-serif text-[13px]">
            Nothing here
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCard({ row }: { row: ItemRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      <KanbanCard row={row} />
    </div>
  );
}

function KanbanCard({ row, overlay }: { row: ItemRow; overlay?: boolean }) {
  const open = useOpenItem();
  return (
    <div
      data-item-id={row.id}
      onClick={() => !overlay && open(row.id)}
      className={cn(
        "border-line bg-surface-1 hover:border-line-strong data-[selected]:ring-accent/40 cursor-grab rounded-[12px] border p-3 shadow-sm transition-[box-shadow,border-color] hover:shadow-md active:cursor-grabbing data-[selected]:ring-2",
        overlay && "rotate-[1.5deg] shadow-lg",
      )}
    >
      <div className="text-ink-subtle flex items-center gap-1.5 text-[11.5px]">
        <KindIcon kind={row.kind} state={row.state} isDraft={row.isDraft} />
        <span className="truncate font-mono">{slug(row.repoFullName, row.number)}</span>
        {row.meta.personalStage ? (
          <span
            className="text-accent-fg ml-auto text-[10.5px] font-medium"
            title="Stage set manually"
          >
            manual
          </span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium">{row.title}</p>
      {row.attentionReasons[0] ? (
        <div className="mt-2">
          <ReasonChip reason={row.attentionReasons[0]} size="xs" />
        </div>
      ) : null}
      <div className="text-ink-subtle mt-2 flex items-center gap-2 text-[11.5px]">
        {row.kind === "pr" ? <CiBadge ci={row.ciState} compact /> : null}
        <ReviewerStack reviewers={row.reviewers} size={18} max={3} />
        <PriorityBadge priority={row.meta.priority} />
        <span className="tabular ml-auto">{relative(row.lastActivityAt ?? row.ghUpdatedAt)}</span>
      </div>
    </div>
  );
}
