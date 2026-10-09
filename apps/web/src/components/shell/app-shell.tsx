"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MoreHorizontal, Plus, Search } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { AppProvider, useApp, type AppInfo } from "./app-context";
import { SyncChip } from "./sync-chip";
import { SyncFailureBanner } from "./sync-failure-banner";
import { GlobalLayer } from "./global-layer";
import { useUnreadCount } from "@/hooks/use-unread";

export function AppShell({ info, children }: { info: AppInfo; children: React.ReactNode }) {
  return (
    <AppProvider info={info}>
      <ShellFrame>{children}</ShellFrame>
      <GlobalLayer />
    </AppProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="bg-accent text-accent-ink sr-only z-[70] rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="border-line bg-surface-1 fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r lg:flex">
        <SidebarContent />
      </aside>
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" title="Navigation">
          <SidebarContent />
        </SheetContent>
      </Dialog>

      <div className="lg:pl-[232px]">
        <Topbar onMenu={() => setNavOpen(true)} />
        <SyncFailureBanner />
        <main
          id="main"
          className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16"
        >
          {children}
        </main>
      </div>
      <MobileTabs onMore={() => setNavOpen(true)} />
    </div>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const { isDemo, user } = useApp();
  const unread = useUnreadCount();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Contrib home" className="rounded-md">
          <Wordmark />
        </Link>
        {isDemo ? (
          <span className="border-attention/40 bg-attention-bg text-attention-fg ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
            Demo
          </span>
        ) : null}
      </div>
      <nav aria-label="Primary" className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group text-ink-muted hover:bg-surface-2 hover:text-ink flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors duration-150",
                    active && "bg-surface-2 text-ink",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0 transition-colors",
                      active ? "text-accent" : "text-ink-subtle group-hover:text-ink-muted",
                    )}
                    strokeWidth={1.9}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/inbox" && unread > 0 ? (
                    <span className="tabular bg-accent text-accent-ink rounded-full px-1.5 font-mono text-[11px] leading-[18px] font-semibold">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-line space-y-3 border-t p-4">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="border-line size-8 rounded-full border" />
          ) : (
            <span className="bg-attention-bg text-attention-fg flex size-8 items-center justify-center rounded-full font-semibold">
              {user.login.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{user.name ?? user.login}</p>
            <p className="text-ink-subtle truncate font-mono text-[11.5px]">@{user.login}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { setPaletteOpen, setAddOpen, isDemo } = useApp();
  return (
    <header className="border-line bg-bg/85 supports-[backdrop-filter]:bg-bg/70 sticky top-0 z-20 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 px-4 sm:px-6 lg:px-10">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <Menu />
        </Button>
        <Link href="/" className="lg:hidden" aria-label="Contrib home">
          <Wordmark />
        </Link>
        {isDemo ? (
          <span className="border-attention/40 bg-attention-bg text-attention-fg rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase lg:hidden">
            Demo
          </span>
        ) : null}
        <button
          onClick={() => setPaletteOpen(true)}
          className="border-line bg-surface-1 text-ink-subtle hover:border-line-strong hover:text-ink-muted hidden h-9 w-full max-w-[420px] items-center gap-2 rounded-[10px] border px-3 text-[13px] shadow-sm transition-colors md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search items, repos, actions…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Search"
            onClick={() => setPaletteOpen(true)}
          >
            <Search />
          </Button>
          <SyncChip />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddOpen(true)}
            aria-label="Add item"
          >
            <Plus />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function MobileTabs({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.mobile);
  return (
    <nav
      aria-label="Primary mobile"
      className="border-line bg-surface-1/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-ink-subtle flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active && "text-ink",
                )}
              >
                <Icon className={cn("size-5", active && "text-accent")} strokeWidth={1.9} />
                {item.label.replace("All items", "Items")}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            onClick={onMore}
            className="text-ink-subtle flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
          >
            <MoreHorizontal className="size-5" strokeWidth={1.9} />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
