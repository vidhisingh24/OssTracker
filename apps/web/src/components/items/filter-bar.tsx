"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { BALL_META, STAGE_META } from "@contrib/core/derive";
import { BALLS, CI_STATES, ITEM_KINDS, ITEM_STATES, PRIORITIES, STAGES } from "@contrib/core/types";
import { useFacets } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

/** URL-backed filter state. Every filter lives in the query string so views are shareable/bookmarkable. */
export function useUrlFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp.get(k)?.split(",").filter(Boolean) ?? [];
  const set = React.useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        const val = Array.isArray(v) ? v.join(",") : v;
        if (!val) next.delete(k);
        else next.set(k, val);
      }
      if (!("page" in patch)) next.delete("page");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  /** Query string for the API (drawer param removed). */
  const apiQuery = React.useMemo(() => {
    const p = new URLSearchParams(sp.toString());
    p.delete("item");
    p.delete("view");
    p.delete("cols");
    p.delete("lanes");
    return p.toString();
  }, [sp]);
  return { sp, get, set, apiQuery };
}

const FILTER_KEYS = [
  "q",
  "kind",
  "state",
  "stage",
  "ball",
  "ci",
  "priority",
  "repo",
  "label",
  "tag",
  "program",
  "relation",
  "source",
  "archived",
];

export function FilterBar({ hide = [], extra }: { hide?: string[]; extra?: React.ReactNode }) {
  const { sp, get, set } = useUrlFilters();
  const { data: facets } = useFacets();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  React.useEffect(() => setQ(sp.get("q") ?? ""), [sp]);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q: q || null });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = FILTER_KEYS.filter((k) => sp.get(k));
  const f = (key: string, label: string, options: { value: string; label: string }[]) =>
    hide.includes(key) ? null : (
      <MultiFilter
        key={key}
        label={label}
        values={get(key)}
        options={options}
        onChange={(v) => set({ [key]: v })}
      />
    );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          id="items-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, repo, #, notes…"
          className="h-8 pl-9 text-[13px]"
          aria-label="Search items"
        />
      </div>
      {f(
        "kind",
        "Type",
        ITEM_KINDS.map((k) => ({
          value: k,
          label: k === "pr" ? "Pull request" : k[0]!.toUpperCase() + k.slice(1),
        })),
      )}
      {f(
        "state",
        "State",
        ITEM_STATES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
      )}
      {f(
        "stage",
        "Stage",
        STAGES.map((s) => ({ value: s, label: STAGE_META[s].label })),
      )}
      {f(
        "ball",
        "Waiting on",
        BALLS.map((b) => ({ value: b, label: BALL_META[b].label })),
      )}
      {f(
        "repo",
        "Repo",
        (facets?.facets.repos ?? []).map((r) => ({ value: r, label: r })),
      )}
      {f(
        "label",
        "Label",
        (facets?.facets.labels ?? []).map((r) => ({ value: r, label: r })),
      )}
      {f(
        "tag",
        "Tag",
        (facets?.facets.tags ?? []).map((r) => ({ value: r, label: `#${r}` })),
      )}
      {f(
        "priority",
        "Priority",
        PRIORITIES.map((p) => ({ value: p, label: p })),
      )}
      {f(
        "ci",
        "CI",
        CI_STATES.map((c) => ({ value: c, label: c })),
      )}
      {hide.includes("program") || !facets?.facets.programs.length ? null : (
        <MultiFilter
          label="Program"
          single
          values={get("program")}
          options={facets.facets.programs.map((p) => ({ value: p, label: p }))}
          onChange={(v) => set({ program: v.slice(-1) })}
        />
      )}
      {active.length ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
        >
          <X /> Clear
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">{extra}</div>
    </div>
  );
}

function MultiFilter({
  label,
  values,
  options,
  onChange,
  single,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
  single?: boolean;
}) {
  const activeCount = values.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
            activeCount
              ? "border-accent/50 bg-attention-bg text-attention-fg"
              : "border-line-strong bg-surface-1 text-ink-muted hover:text-ink",
          )}
        >
          {label}
          {activeCount ? (
            <span className="tabular font-mono">
              {activeCount === 1
                ? `: ${options.find((o) => o.value === values[0])?.label ?? values[0]}`
                : ` ${activeCount}`}
            </span>
          ) : null}
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.length === 0 ? (
          <p className="text-ink-subtle px-2.5 py-2 text-[12.5px]">No values yet</p>
        ) : null}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={values.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) =>
              onChange(
                single
                  ? c
                    ? [o.value]
                    : []
                  : c
                    ? [...values, o.value]
                    : values.filter((v) => v !== o.value),
              )
            }
          >
            <span className="truncate">{o.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {activeCount ? (
          <>
            <DropdownMenuSeparator />
            <button
              className="text-ink-muted hover:bg-surface-2 w-full rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px]"
              onClick={() => onChange([])}
            >
              Clear {label.toLowerCase()}
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
