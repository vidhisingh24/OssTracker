"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Flame, GitMerge, MessageSquare, Timer } from "lucide-react";
import { formatDuration } from "@contrib/core/derive";
import { useInsights, type Insights } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const axis = {
  fontSize: 11.5,
  fill: "var(--ink-subtle)",
  fontFamily: "var(--font-jetbrains), monospace",
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-line bg-surface-1 rounded-[10px] border px-3 py-2 text-[12px] shadow-md">
      <p className="text-ink mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-ink-muted flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-ink tabular font-mono">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function InsightsView() {
  const { data, isLoading } = useInsights();
  return (
    <div>
      <PageHeader
        title="Insights"
        description="How your open-source work is going — volume, pace, and how quickly maintainers respond."
      />
      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[16px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={GitMerge}
              label="PRs merged"
              value={data.totals.prsMerged}
              sub={
                data.totals.mergeRate != null
                  ? `${Math.round(data.totals.mergeRate * 100)}% merge rate`
                  : undefined
              }
            />
            <Kpi
              icon={Timer}
              label="Median time to merge"
              value={formatDuration(data.totals.medianMergeHours)}
              sub={`first reply ${formatDuration(data.totals.medianFirstResponseHours)}`}
            />
            <Kpi
              icon={Flame}
              label="Current streak"
              value={`${data.streak.current}d`}
              sub={`longest ${data.streak.longest}d · ${data.totals.activeDays} active days`}
            />
            <Kpi
              icon={MessageSquare}
              label="Repos contributed"
              value={data.totals.reposContributed}
              sub={`${data.totals.reviewsGiven} reviews · ${data.totals.commentsWritten} comments`}
            />
          </dl>

          <Card>
            <CardHeader
              title="Contribution activity"
              description="PRs, issues, comments, reviews and merges — last 12 months."
            />
            <div className="px-5 pb-5">
              <Heatmap data={data.heatmap} />
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Pull requests per month" description="Opened vs merged" />
              <div
                className="h-64 px-2 pb-4"
                role="img"
                aria-label={`Pull requests per month. ${data.monthly.map((m) => `${m.month}: ${m.opened} opened, ${m.merged} merged`).join("; ")}`}
              >
                <ResponsiveContainer>
                  <BarChart
                    data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}
                    margin={{ top: 16, right: 12, left: -16, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="label"
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <RTooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar
                      dataKey="opened"
                      name="Opened"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={14}
                    />
                    <Bar
                      dataKey="merged"
                      name="Merged"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={14}
                    >
                      <LabelList
                        dataKey="merged"
                        position="top"
                        style={{ ...axis, fill: "var(--ink-muted)" }}
                        formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend
                items={[
                  ["Opened", "var(--chart-2)"],
                  ["Merged", "var(--chart-1)"],
                ]}
              />
            </Card>

            <Card>
              <CardHeader title="PRs by repo" description="Your top repositories" />
              <div className="px-5 pb-5">
                <HBarList
                  rows={data.byRepo.map((r) => ({
                    label: r.repo,
                    segments: [
                      { v: r.merged, c: "var(--chart-3)", n: "merged" },
                      { v: r.open, c: "var(--chart-2)", n: "open" },
                      { v: r.closed, c: "var(--chart-5)", n: "closed" },
                    ],
                  }))}
                />
                <Legend
                  items={[
                    ["Merged", "var(--chart-3)"],
                    ["Open", "var(--chart-2)"],
                    ["Closed", "var(--chart-5)"],
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Review turnaround"
                description="Median time to first response and to merge, per repo"
              />
              <div className="px-5 pb-5">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-ink-subtle text-left text-[11.5px] tracking-wide uppercase">
                      <th className="pb-2 font-medium">Repo</th>
                      <th className="pb-2 text-right font-medium">First reply</th>
                      <th className="pb-2 text-right font-medium">To merge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-line divide-y">
                    {data.turnaround.map((t) => (
                      <tr key={t.repo}>
                        <td className="truncate py-2 font-mono text-[12.5px]">{t.repo}</td>
                        <td className="tabular py-2 text-right font-mono">
                          {formatDuration(t.firstResponseHours)}
                        </td>
                        <td className="tabular py-2 text-right font-mono">
                          {formatDuration(t.mergeHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Time to first response"
                description="How long maintainers take to reply to your issues and PRs"
              />
              <div
                className="h-60 px-2 pb-4"
                role="img"
                aria-label={`Response time distribution: ${data.responseBuckets.map((b) => `${b.bucket} ${b.count}`).join(", ")}`}
              >
                <ResponsiveContainer>
                  <BarChart
                    data={data.responseBuckets}
                    margin={{ top: 18, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="bucket"
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <RTooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar
                      dataKey="count"
                      name="Items"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    >
                      <LabelList
                        dataKey="count"
                        position="top"
                        style={{ ...axis, fill: "var(--ink-muted)" }}
                        formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Language mix" description="Your PRs by repository language" />
              <div className="px-5 pb-5">
                <LanguageBar langs={data.languages} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, 1)).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="card px-4 py-4">
      <dt className="text-ink-subtle flex items-center gap-1.5 text-[12px]">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="tabular mt-1 font-mono text-[26px] font-medium tracking-tight">{value}</dd>
      {sub ? <p className="text-ink-subtle text-[12px]">{sub}</p> : null}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="text-ink-muted flex flex-wrap gap-4 px-5 pt-3 text-[12px]">
      {items.map(([l, c]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: c }} aria-hidden /> {l}
        </span>
      ))}
    </div>
  );
}

function Heatmap({ data }: { data: Insights["heatmap"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const first = new Date(`${data[0]?.day ?? "2026-01-01"}T00:00:00Z`).getUTCDay();
  const cells = [...Array.from({ length: first }, () => null), ...data];
  const weeks: ((typeof data)[number] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (c: number) =>
    c === 0 ? 0 : c / max < 0.25 ? 1 : c / max < 0.5 ? 2 : c / max < 0.75 ? 3 : 4;
  const fills = [
    "var(--surface-3)",
    "color-mix(in srgb, var(--chart-1) 30%, var(--surface-2))",
    "color-mix(in srgb, var(--chart-1) 55%, var(--surface-2))",
    "color-mix(in srgb, var(--chart-1) 80%, var(--surface-2))",
    "var(--chart-1)",
  ];
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div>
      <div
        className="scrollbar-thin overflow-x-auto"
        role="img"
        aria-label={`${total} contributions in the last year`}
      >
        <svg width={weeks.length * 14} height={7 * 14 + 16} className="block">
          {weeks.map((w, wi) => {
            const firstDay = w.find((d) => d)?.day;
            const showMonth = firstDay && Number(firstDay.slice(8, 10)) <= 7;
            return (
              <g key={wi} transform={`translate(${wi * 14},0)`}>
                {showMonth ? (
                  <text y={10} fontSize={10} fill="var(--ink-subtle)">
                    {monthLabel(firstDay.slice(0, 7))}
                  </text>
                ) : null}
                {w.map((d, di) =>
                  d ? (
                    <rect
                      key={d.day}
                      x={0}
                      y={16 + di * 14}
                      width={11}
                      height={11}
                      rx={2.5}
                      fill={fills[level(d.count)]}
                    >
                      <title>{`${d.day}: ${d.count} contribution${d.count === 1 ? "" : "s"}`}</title>
                    </rect>
                  ) : null,
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="text-ink-subtle mt-2 flex items-center justify-end gap-1.5 text-[11.5px]">
        Less
        {fills.map((f, i) => (
          <span
            key={i}
            className="size-[11px] rounded-[2.5px]"
            style={{ background: f }}
            aria-hidden
          />
        ))}
        More
      </div>
    </div>
  );
}

function HBarList({
  rows,
}: {
  rows: { label: string; segments: { v: number; c: string; n: string }[] }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((s, x) => s + x.v, 0)));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const total = r.segments.reduce((s, x) => s + x.v, 0);
        return (
          <li
            key={r.label}
            className="grid grid-cols-[minmax(0,180px)_1fr_32px] items-center gap-3 text-[12.5px]"
          >
            <span className="text-ink-muted truncate font-mono" title={r.label}>
              {r.label}
            </span>
            <span
              className="bg-surface-2 flex h-3 overflow-hidden rounded-full"
              role="img"
              aria-label={`${r.label}: ${r.segments.map((s) => `${s.v} ${s.n}`).join(", ")}`}
            >
              {r.segments.map((s) =>
                s.v ? (
                  <span key={s.n} style={{ width: `${(s.v / max) * 100}%`, background: s.c }} />
                ) : null,
              )}
            </span>
            <span className="tabular text-right font-mono">{total}</span>
          </li>
        );
      })}
    </ul>
  );
}

function LanguageBar({ langs }: { langs: Insights["languages"] }) {
  const total = langs.reduce((s, l) => s + l.count, 0) || 1;
  return (
    <div>
      <div
        className="flex h-3 overflow-hidden rounded-full"
        role="img"
        aria-label={langs
          .map((l) => `${l.language} ${Math.round((l.count / total) * 100)}%`)
          .join(", ")}
      >
        {langs.map((l) => (
          <span
            key={l.language}
            style={{
              width: `${(l.count / total) * 100}%`,
              background: l.color ?? "var(--chart-5)",
            }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {langs.map((l) => (
          <li key={l.language} className="text-ink-muted inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: l.color ?? "var(--chart-5)" }}
              aria-hidden
            />
            {l.language}{" "}
            <span className="text-ink tabular font-mono">
              {Math.round((l.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
