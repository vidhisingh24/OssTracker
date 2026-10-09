"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Github, Upload, XCircle } from "lucide-react";
import type { Settings } from "@contrib/core/types";
import { fetchJson, postJson, useSettings } from "@/lib/api";
import { relative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/items/item-detail";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar, Chip } from "@/components/status";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K];
};

export function SettingsView() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();
  const save = async (patch: DeepPartial<Settings>) => {
    try {
      await postJson("/api/settings", patch, "PATCH");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (isLoading || !data) return <Skeleton className="h-[600px] rounded-[16px]" />;
  const s = data.settings;
  const c = data.connection;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connection, sync cadence, notifications and your data."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="GitHub connection" icon={<Github className="size-4" />} />
          <div className="space-y-3 px-5 pb-5 text-[13.5px]">
            {c.mode === "demo" ? (
              <div className="border-attention/30 bg-attention-bg text-attention-fg rounded-[12px] border px-4 py-3">
                <p className="font-semibold">Demo mode</p>
                <p className="text-ink-muted mt-1 font-serif text-[14px]">
                  You're exploring fake data. Set{" "}
                  <code className="font-mono text-[12px]">AUTH_GITHUB_ID</code>,{" "}
                  <code className="font-mono text-[12px]">AUTH_GITHUB_SECRET</code>,{" "}
                  <code className="font-mono text-[12px]">AUTH_SECRET</code> and{" "}
                  <code className="font-mono text-[12px]">TOKEN_ENCRYPTION_KEY</code> (see README)
                  and restart to sync your real activity.
                </p>
              </div>
            ) : c.account ? (
              <div className="flex items-center gap-3">
                <Avatar login={c.account.login} src={c.account.avatarUrl} size={40} />
                <div className="flex-1">
                  <p className="font-semibold">{c.account.name ?? c.account.login}</p>
                  <p className="text-ink-subtle font-mono text-[12.5px]">@{c.account.login}</p>
                </div>
                <Chip tone="success" icon={CheckCircle2}>
                  Connected
                </Chip>
              </div>
            ) : (
              <p className="text-warning-fg flex items-center gap-2">
                <AlertTriangle className="size-4" />{" "}
                {c.patConfigured
                  ? "Using personal access token (GITHUB_TOKEN)."
                  : "Not connected — sign in with GitHub."}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
              <dt className="text-ink-subtle">Granted scopes</dt>
              <dd className="font-mono">{c.account?.scopes ?? "—"}</dd>
              <dt className="text-ink-subtle">Requested scopes</dt>
              <dd className="font-mono">{c.requestedScopes.join(" ")}</dd>
              <dt className="text-ink-subtle">Token stored</dt>
              <dd>{c.account ? `${relative(c.account.tokenUpdatedAt)} · AES-256-GCM` : "—"}</dd>
              <dt className="text-ink-subtle">Database</dt>
              <dd className="font-mono">{c.dbDriver}</dd>
              <dt className="text-ink-subtle">Webhooks</dt>
              <dd>{c.webhooksEnabled ? "enabled" : "off (polling only)"}</dd>
            </dl>
            {c.authEnabled ? (
              <form action="/api/auth/signout" method="post">
                <Button variant="secondary" size="sm" asChild>
                  <a href="/api/auth/signout">Sign out</a>
                </Button>
              </form>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Appearance" />
          <div className="flex items-center justify-between px-5 pb-5">
            <span className="text-[13.5px]">Theme</span>
            <ThemeToggle />
          </div>
          <CardHeader
            title="Stale thresholds"
            description="When items count as stale and when to suggest a ping"
            className="pt-2"
          />
          <div className="grid grid-cols-3 gap-3 px-5 pb-5">
            <NumField
              label="PR stale (days)"
              value={s.stale.prDays}
              onSave={(v) => save({ stale: { prDays: v } })}
            />
            <NumField
              label="Issue stale (days)"
              value={s.stale.issueDays}
              onSave={(v) => save({ stale: { issueDays: v } })}
            />
            <NumField
              label="Suggest ping after"
              value={s.stale.pingAfterDays}
              onSave={(v) => save({ stale: { pingAfterDays: v } })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Sync"
            description="Polling cadence (applied by the worker on its next tick)"
          />
          <div className="grid grid-cols-2 gap-3 px-5 pb-3 sm:grid-cols-4">
            <NumField
              label="Hot (min)"
              value={s.sync.hotMinutes}
              onSave={(v) => save({ sync: { hotMinutes: v } })}
            />
            <NumField
              label="Warm (min)"
              value={s.sync.warmMinutes}
              onSave={(v) => save({ sync: { warmMinutes: v } })}
            />
            <NumField
              label="Cold (hours)"
              value={s.sync.coldHours}
              onSave={(v) => save({ sync: { coldHours: v } })}
            />
            <NumField
              label="Min quota left"
              value={s.sync.minRateRemaining}
              onSave={(v) => save({ sync: { minRateRemaining: v } })}
            />
          </div>
          <div className="space-y-3 px-5 pb-5">
            <SwitchRow
              label="Exclude my own repos"
              description="Skip repos owned by you during discovery."
              checked={s.sync.excludeOwnRepos}
              onChange={(v) => void save({ sync: { excludeOwnRepos: v } })}
            />
            <ListField
              label="Excluded repos"
              placeholder="owner/name, owner/other"
              value={s.sync.excludedRepos}
              onSave={(v) => save({ sync: { excludedRepos: v } })}
            />
            <ListField
              label="Excluded orgs"
              placeholder="some-org"
              value={s.sync.excludedOrgs}
              onSave={(v) => save({ sync: { excludedOrgs: v } })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Notifications"
            description="High-priority events only: CI failed, changes requested, maintainer replies, review requests, mentions, reminders."
          />
          <div className="divide-line divide-y px-5 pb-3">
            <ChannelRow
              label="Email (Resend)"
              configured={data.channels.email}
              checked={s.notify.email}
              onChange={(v) => void save({ notify: { email: v } })}
            />
            <ChannelRow
              label="Telegram"
              configured={data.channels.telegram}
              checked={s.notify.telegram}
              onChange={(v) => void save({ notify: { telegram: v } })}
            />
            <ChannelRow
              label="ntfy"
              configured={data.channels.ntfy}
              checked={s.notify.ntfy}
              onChange={(v) => void save({ notify: { ntfy: v } })}
            />
            <SwitchRow
              label="Quiet hours"
              description={`${s.notify.quietHours.start}–${s.notify.quietHours.end} (${s.notify.timezone})`}
              checked={s.notify.quietHours.enabled}
              onChange={(v) => void save({ notify: { quietHours: { enabled: v } } })}
            />
            <SwitchRow
              label="Daily morning digest"
              description={`Around ${String(s.notify.digest.hour).padStart(2, "0")}:00`}
              checked={s.notify.digest.enabled}
              onChange={(v) => void save({ notify: { digest: { enabled: v } } })}
            />
            <SwitchRow
              label="Mark read on GitHub too"
              description="Reading in Contrib's inbox also marks the GitHub thread read."
              checked={s.notify.markReadOnGithub}
              onChange={(v) => void save({ notify: { markReadOnGithub: v } })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 px-5 pb-5">
            <TextField
              label="Quiet from"
              value={s.notify.quietHours.start}
              onSave={(v) => save({ notify: { quietHours: { start: v } } })}
            />
            <TextField
              label="Quiet until"
              value={s.notify.quietHours.end}
              onSave={(v) => save({ notify: { quietHours: { end: v } } })}
            />
            <TextField
              label="Time zone"
              value={s.notify.timezone}
              onSave={(v) => save({ notify: { timezone: v } })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Your data"
            description="Backups contain everything you typed (notes, tags, programs, planned items). GitHub data can always be re-synced."
          />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            <Button variant="secondary" size="sm" asChild>
              <a href="/api/backup">
                <Download /> Export backup (JSON)
              </a>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href="/api/items/export?format=csv&archived=include">
                <Download /> All items (CSV)
              </a>
            </Button>
            <ImportButton />
          </div>
        </Card>

        <Card className="border-danger/30">
          <CardHeader
            title="Danger zone"
            icon={<AlertTriangle className="text-danger-fg size-4" />}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
            <p className="text-ink-muted max-w-sm text-[13px]">
              {c.mode === "demo"
                ? "Reset the demo data to its original state."
                : "Re-sync from scratch: drops synced GitHub data and events, keeps your notes, tags, programs and planned items."}
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (
                  !window.confirm(
                    c.mode === "demo" ? "Reset demo data?" : "Re-sync everything from scratch?",
                  )
                )
                  return;
                try {
                  await postJson("/api/settings", {
                    action: c.mode === "demo" ? "reset-demo" : "resync",
                  });
                  await qc.invalidateQueries();
                  toast.success(c.mode === "demo" ? "Demo data reset" : "Full re-sync started");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {c.mode === "demo" ? "Reset demo data" : "Re-sync from scratch"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChannelRow({
  label,
  configured,
  checked,
  onChange,
}: {
  label: string;
  configured: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return configured ? (
    <SwitchRow label={label} checked={checked} onChange={onChange} />
  ) : (
    <div className="flex items-center justify-between py-2 text-[13.5px]">
      <span className="font-medium">{label}</span>
      <span className="text-ink-subtle inline-flex items-center gap-1 text-[12.5px]">
        <XCircle className="size-3.5" /> not configured in env
      </span>
    </div>
  );
}

function NumField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-ink-muted text-[12px]">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        defaultValue={value}
        key={value}
        min={0}
        className="h-8 font-mono text-[13px]"
        onBlur={(e) => Number(e.target.value) !== value && onSave(Number(e.target.value))}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-ink-muted text-[12px]">
        {label}
      </Label>
      <Input
        id={id}
        defaultValue={value}
        key={value}
        className="h-8 font-mono text-[13px]"
        onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
      />
    </div>
  );
}

function ListField({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string[];
  onSave: (v: string[]) => void;
  placeholder: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-ink-muted text-[12px]">
        {label}
      </Label>
      <Input
        id={id}
        defaultValue={value.join(", ")}
        key={value.join(",")}
        placeholder={placeholder}
        className="h-8 font-mono text-[12.5px]"
        onBlur={(e) => {
          const next = e.target.value
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          if (next.join(",") !== value.join(",")) onSave(next);
        }}
      />
    </div>
  );
}

function ImportButton() {
  const ref = React.useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const res = await fetchJson<{ meta: number; programs: number; localItems: number }>(
              "/api/backup",
              {
                method: "POST",
                body: await file.text(),
                headers: { "Content-Type": "application/json" },
              },
            );
            toast.success(
              `Imported ${res.meta} notes, ${res.programs} programs, ${res.localItems} local items`,
            );
            await qc.invalidateQueries();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            e.target.value = "";
          }
        }}
      />
      <Button variant="secondary" size="sm" onClick={() => ref.current?.click()}>
        <Upload /> Import backup
      </Button>
    </>
  );
}
