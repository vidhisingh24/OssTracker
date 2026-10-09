"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Command } from "cmdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CornerDownLeft,
  FilePlus2,
  Link as LinkIcon,
  Moon,
  RefreshCw,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ItemDetailView } from "@/components/items/item-detail";
import { KindIcon } from "@/components/status";
import { fetchJson, postJson, useUpdateMeta } from "@/lib/api";
import { slug, snoozeOptions } from "@/lib/format";
import { NAV } from "./nav";
import { useApp } from "./app-context";
import type { ItemKind, ItemState } from "@contrib/core/types";

export function GlobalLayer() {
  return (
    <>
      <React.Suspense fallback={null}>
        <ItemDrawer />
        <Shortcuts />
      </React.Suspense>
      <Palette />
      <AddDialog />
      <CheatSheet />
    </>
  );
}

/* ───────────── Drawer ───────────── */

function ItemDrawer() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = sp.get("item");
  const close = React.useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    next.delete("item");
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [sp, router, pathname]);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && close()}>
      <SheetContent title="Item details" className="max-w-[min(1040px,100vw)]">
        {id ? <ItemDetailView id={id} onClose={close} /> : null}
      </SheetContent>
    </Dialog>
  );
}

/* ───────────── Keyboard shortcuts ───────────── */

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
      !!t.closest("[cmdk-root]"))
  );
}

function Shortcuts() {
  const router = useRouter();
  const { setPaletteOpen, setCheatsheetOpen, setAddOpen } = useApp();
  const sp = useSearchParams();
  const pathname = usePathname();
  const update = useUpdateMeta();
  const chord = React.useRef<number>(0);

  React.useEffect(() => {
    const selectable = () => [...document.querySelectorAll<HTMLElement>("main [data-item-id]")];
    const current = () => document.querySelector<HTMLElement>("main [data-item-id][data-selected]");
    const select = (el: HTMLElement | undefined) => {
      if (!el) return;
      document
        .querySelectorAll("main [data-selected]")
        .forEach((n) => n.removeAttribute("data-selected"));
      el.setAttribute("data-selected", "true");
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.focus({ preventScroll: true });
    };
    const targetId = () => sp.get("item") ?? current()?.dataset.itemId ?? null;

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      if (chord.current && now - chord.current < 1200) {
        chord.current = 0;
        const nav = NAV.find((n) => n.chord === e.key);
        if (nav) {
          e.preventDefault();
          router.push(nav.href);
        }
        return;
      }
      switch (e.key) {
        case "g":
          chord.current = now;
          return;
        case "/":
          e.preventDefault();
          if (pathname === "/items")
            document.querySelector<HTMLInputElement>("#items-search")?.focus();
          else setPaletteOpen(true);
          return;
        case "?":
          e.preventDefault();
          setCheatsheetOpen(true);
          return;
        case "c":
          e.preventDefault();
          setAddOpen(true);
          return;
        case "j":
        case "k": {
          const els = selectable();
          if (!els.length) return;
          e.preventDefault();
          const idx = els.findIndex((n) => n.hasAttribute("data-selected"));
          select(
            els[
              e.key === "j"
                ? Math.min(els.length - 1, idx + 1)
                : Math.max(0, idx === -1 ? 0 : idx - 1)
            ],
          );
          return;
        }
        case "Enter":
        case "o": {
          const el = current();
          if (el && document.activeElement === el) return; // native handler
          if (el) {
            e.preventDefault();
            el.click();
          }
          return;
        }
        case "e":
        case "s":
        case "p": {
          const id = targetId();
          if (!id) return;
          e.preventDefault();
          if (e.key === "e")
            update.mutate(
              { id, patch: { archived: true } },
              {
                onSuccess: () =>
                  toast("Archived", {
                    action: {
                      label: "Undo",
                      onClick: () => update.mutate({ id, patch: { archived: false } }),
                    },
                  }),
              },
            );
          else if (e.key === "s")
            update.mutate(
              { id, patch: { snoozedUntil: snoozeOptions()[1]!.iso } },
              {
                onSuccess: () =>
                  toast("Snoozed until tomorrow morning", {
                    action: {
                      label: "Undo",
                      onClick: () => update.mutate({ id, patch: { snoozedUntil: null } }),
                    },
                  }),
              },
            );
          else update.mutate({ id, patch: { pinned: true } }, { onSuccess: () => toast("Pinned") });
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setPaletteOpen, setCheatsheetOpen, setAddOpen, sp, pathname, update]);
  return null;
}

/* ───────────── Command palette ───────────── */

interface SearchHit {
  id: string;
  title: string;
  repoFullName: string;
  number: number | null;
  kind: ItemKind;
  state: ItemState;
}

function Palette() {
  const { paletteOpen, setPaletteOpen, setAddOpen, setCheatsheetOpen } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const { setTheme, resolvedTheme } = useTheme();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 140);
    return () => clearTimeout(t);
  }, [q]);
  React.useEffect(() => {
    if (!paletteOpen) setQ("");
  }, [paletteOpen]);
  const { data } = useQuery({
    queryKey: ["palette", debounced],
    queryFn: () =>
      fetchJson<{ results: SearchHit[] }>(`/api/meta?q=${encodeURIComponent(debounced)}`),
    enabled: paletteOpen && debounced.trim().length > 0,
  });
  const run = (fn: () => void) => {
    setPaletteOpen(false);
    fn();
  };
  const syncNow = async () => {
    try {
      await postJson("/api/sync", { kind: "cold" });
      toast.success("Sync started");
      void qc.invalidateQueries({ queryKey: ["sync"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent
        title="Command palette"
        hideClose
        className="max-w-xl p-0 [&>div:first-child]:hidden [&>div:last-child]:p-0"
      >
        <Command label="Command palette" shouldFilter className="flex flex-col" loop>
          <div className="border-line flex items-center gap-2 border-b px-4">
            <Search className="text-ink-subtle size-4" aria-hidden />
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Search items, jump to pages, run actions…"
              className="text-ink placeholder:text-ink-subtle h-12 flex-1 bg-transparent text-[14.5px] outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="text-ink-muted px-3 py-8 text-center font-serif text-[14px]">
              No matches. Try a repo name or PR number.
            </Command.Empty>
            {data?.results.length ? (
              <PaletteGroup heading="Items">
                {data.results.map((r) => (
                  <PaletteItem
                    key={r.id}
                    value={`item ${r.title} ${r.repoFullName} ${r.number ?? ""}`}
                    onSelect={() =>
                      run(() => router.push(`?item=${encodeURIComponent(r.id)}`, { scroll: false }))
                    }
                  >
                    <KindIcon kind={r.kind} state={r.state} />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="text-ink-subtle font-mono text-[11.5px]">
                      {slug(r.repoFullName, r.number)}
                    </span>
                  </PaletteItem>
                ))}
              </PaletteGroup>
            ) : null}
            <PaletteGroup heading="Go to">
              {NAV.map((n) => (
                <PaletteItem
                  key={n.href}
                  value={`go ${n.label}`}
                  onSelect={() => run(() => router.push(n.href))}
                >
                  <n.icon className="text-ink-subtle size-4" />
                  <span className="flex-1">{n.label}</span>
                  <span className="flex gap-1">
                    <Kbd>g</Kbd>
                    <Kbd>{n.chord}</Kbd>
                  </span>
                </PaletteItem>
              ))}
            </PaletteGroup>
            <PaletteGroup heading="Actions">
              <PaletteItem
                value="action sync now refresh"
                onSelect={() => run(() => void syncNow())}
              >
                <RefreshCw className="text-ink-subtle size-4" />{" "}
                <span className="flex-1">Sync now</span>
              </PaletteItem>
              <PaletteItem
                value="action add item url planned track"
                onSelect={() => run(() => setAddOpen(true))}
              >
                <FilePlus2 className="text-ink-subtle size-4" />{" "}
                <span className="flex-1">Add item by URL or plan one</span>
                <Kbd>c</Kbd>
              </PaletteItem>
              <PaletteItem
                value="action toggle theme dark light"
                onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="text-ink-subtle size-4" />
                ) : (
                  <Moon className="text-ink-subtle size-4" />
                )}
                <span className="flex-1">
                  Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
                </span>
              </PaletteItem>
              <PaletteItem
                value="action keyboard shortcuts help"
                onSelect={() => run(() => setCheatsheetOpen(true))}
              >
                <CornerDownLeft className="text-ink-subtle size-4" />{" "}
                <span className="flex-1">Keyboard shortcuts</span>
                <Kbd>?</Kbd>
              </PaletteItem>
              <PaletteItem
                value="action export csv"
                onSelect={() => run(() => (window.location.href = "/api/items/export?format=csv"))}
              >
                <LinkIcon className="text-ink-subtle size-4" />{" "}
                <span className="flex-1">Export all items (CSV)</span>
              </PaletteItem>
            </PaletteGroup>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:text-ink-subtle mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function PaletteItem({
  children,
  value,
  onSelect,
}: {
  children: React.ReactNode;
  value: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="text-ink data-[selected=true]:bg-surface-2 flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13.5px]"
    >
      {children}
    </Command.Item>
  );
}

/* ───────────── Add item ───────────── */

function AddDialog() {
  const { addOpen, setAddOpen } = useApp();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [planned, setPlanned] = React.useState({ repo: "", title: "", notes: "", url: "" });
  const done = async (id: string, msg: string) => {
    await qc.invalidateQueries();
    setAddOpen(false);
    setUrl("");
    setPlanned({ repo: "", title: "", notes: "", url: "" });
    toast.success(msg);
    router.push(`?item=${encodeURIComponent(id)}`, { scroll: false });
  };
  const submit = async (body: unknown, msg: string) => {
    setBusy(true);
    try {
      const res = await postJson<{ id: string }>("/api/items", body);
      await done(res.id, msg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent
        title="Track something"
        description="Paste any GitHub issue, PR or discussion — or plan work before there's anything on GitHub."
      >
        <Tabs defaultValue="url">
          <TabsList className="mb-4">
            <TabsTrigger value="url">By URL</TabsTrigger>
            <TabsTrigger value="planned">Planned</TabsTrigger>
          </TabsList>
          <TabsContent value="url">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit({ type: "url", url }, "Now tracking");
              }}
            >
              <Label htmlFor="add-url">GitHub URL</Label>
              <Input
                id="add-url"
                autoFocus
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123"
                className="font-mono text-[13px]"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Fetching…" : "Track"}
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="planned">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(
                  {
                    type: "planned",
                    repo: planned.repo,
                    title: planned.title,
                    notes: planned.notes || null,
                    url: planned.url || null,
                  },
                  "Planned item added",
                );
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                <div className="space-y-1">
                  <Label htmlFor="p-repo">Repo</Label>
                  <Input
                    id="p-repo"
                    required
                    pattern="[\w.\-]+/[\w.\-]+"
                    value={planned.repo}
                    onChange={(e) => setPlanned({ ...planned, repo: e.target.value })}
                    placeholder="owner/name"
                    className="font-mono text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-title">What you want to do</Label>
                  <Input
                    id="p-title"
                    required
                    value={planned.title}
                    onChange={(e) => setPlanned({ ...planned, title: e.target.value })}
                    placeholder="Add dark mode to docs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-url">Link (optional)</Label>
                <Input
                  id="p-url"
                  type="url"
                  value={planned.url}
                  onChange={(e) => setPlanned({ ...planned, url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-notes">Notes</Label>
                <Textarea
                  id="p-notes"
                  value={planned.notes}
                  onChange={(e) => setPlanned({ ...planned, notes: e.target.value })}
                  placeholder="Why, first steps, who to talk to…"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={busy}>
                  Add planned item
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Cheat sheet ───────────── */

const SHORTCUTS: [string[], string][] = [
  [["Ctrl", "K"], "Command palette"],
  [["/"], "Search"],
  [["g", "t"], "Go to Today"],
  [["g", "p"], "Go to Pipeline"],
  [["g", "i"], "Go to All items"],
  [["g", "n"], "Go to Inbox"],
  [["g", "r"], "Go to Repos"],
  [["g", "x"], "Go to Insights"],
  [["j"], "Next item"],
  [["k"], "Previous item"],
  [["Enter"], "Open item"],
  [["e"], "Archive item"],
  [["s"], "Snooze until tomorrow"],
  [["p"], "Pin item"],
  [["c"], "Add item"],
  [["?"], "This cheat sheet"],
];

function CheatSheet() {
  const { cheatsheetOpen, setCheatsheetOpen } = useApp();
  return (
    <Dialog open={cheatsheetOpen} onOpenChange={setCheatsheetOpen}>
      <DialogContent title="Keyboard shortcuts">
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {SHORTCUTS.map(([k, label]) => (
            <li key={label} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-ink-muted">{label}</span>
              <span className="flex gap-1">
                {k.map((x) => (
                  <Kbd key={x}>{x}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
