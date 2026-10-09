"use client";

import * as React from "react";
import {
  AlarmClock,
  AlertTriangle,
  AtSign,
  Ban,
  BellRing,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleSlash,
  Clock,
  Eye,
  FileEdit,
  GitMerge,
  GitPullRequest,
  GitPullRequestDraft,
  GitPullRequestClosed,
  Hand,
  Hourglass,
  Loader2,
  MessageCircle,
  MessageSquareReply,
  MessagesSquare,
  Minus,
  Search,
  Swords,
  User,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { BALL_META, CI_META, REASON_META, STAGE_META, type Tone } from "@contrib/core/derive";
import type {
  AttentionReason,
  Ball,
  CiState,
  ItemKind,
  ItemState,
  Stage,
} from "@contrib/core/types";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export const TONE_CLASSES: Record<Tone, { chip: string; text: string; dot: string; ring: string }> =
  {
    attention: {
      chip: "bg-attention-bg text-attention-fg border-attention/25",
      text: "text-attention-fg",
      dot: "bg-attention",
      ring: "ring-attention",
    },
    info: {
      chip: "bg-info-bg text-info-fg border-info/25",
      text: "text-info-fg",
      dot: "bg-info",
      ring: "ring-info",
    },
    success: {
      chip: "bg-success-bg text-success-fg border-success/25",
      text: "text-success-fg",
      dot: "bg-success",
      ring: "ring-success",
    },
    danger: {
      chip: "bg-danger-bg text-danger-fg border-danger/25",
      text: "text-danger-fg",
      dot: "bg-danger",
      ring: "ring-danger",
    },
    warning: {
      chip: "bg-warning-bg text-warning-fg border-warning/25",
      text: "text-warning-fg",
      dot: "bg-warning",
      ring: "ring-warning",
    },
    neutral: {
      chip: "bg-neutral-bg text-neutral-fg border-line-strong",
      text: "text-neutral-fg",
      dot: "bg-neutral",
      ring: "ring-neutral",
    },
  };

export function Chip({
  tone = "neutral",
  icon: Icon,
  children,
  className,
  size = "sm",
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  size?: "xs" | "sm";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-[12px]",
        TONE_CLASSES[tone].chip,
        className,
      )}
    >
      {Icon ? (
        <Icon className={size === "xs" ? "size-3" : "size-3.5"} strokeWidth={2.2} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

export const STAGE_ICONS: Record<Stage, LucideIcon> = {
  discovered: Search,
  claimed: Hand,
  in_progress: Loader2,
  pr_draft: GitPullRequestDraft,
  pr_open: GitPullRequest,
  in_review: Eye,
  changes_requested: FileEdit,
  approved: CheckCircle2,
  merged: GitMerge,
  closed: CircleSlash,
  stale: Hourglass,
};

export function StageBadge({
  stage,
  overridden,
  size,
}: {
  stage: Stage;
  overridden?: boolean;
  size?: "xs" | "sm";
}) {
  const m = STAGE_META[stage];
  return (
    <Chip
      tone={m.tone}
      icon={STAGE_ICONS[stage]}
      size={size}
      title={overridden ? `${m.label} (set manually)` : m.description}
    >
      {m.label}
      {overridden ? <span aria-label="manual override">*</span> : null}
    </Chip>
  );
}

const BALL_ICONS: Record<Ball, LucideIcon> = {
  you: User,
  maintainer: Users,
  ci: Clock,
  nobody: Minus,
};

export function BallBadge({ ball, size }: { ball: Ball; size?: "xs" | "sm" }) {
  const m = BALL_META[ball];
  return (
    <Chip tone={m.tone} icon={BALL_ICONS[ball]} size={size} title={`Ball in court: ${m.label}`}>
      {m.label}
    </Chip>
  );
}

const CI_ICONS: Record<CiState, LucideIcon> = {
  passing: Check,
  failing: XCircle,
  pending: Loader2,
  none: CircleDashed,
};

export function CiBadge({
  ci,
  size,
  compact,
}: {
  ci: CiState;
  size?: "xs" | "sm";
  compact?: boolean;
}) {
  const m = CI_META[ci];
  if (compact) {
    const Icon = CI_ICONS[ci];
    return (
      <Tooltip content={`CI: ${m.label}`}>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[12px] font-medium",
            TONE_CLASSES[m.tone].text,
          )}
        >
          <Icon
            className={cn("size-3.5", ci === "pending" && "animate-spin [animation-duration:2s]")}
            aria-hidden
          />
          <span className="sr-only sm:not-sr-only">CI</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <Chip tone={m.tone} icon={CI_ICONS[ci]} size={size}>
      CI {m.label.toLowerCase()}
    </Chip>
  );
}

const REASON_ICONS: Record<AttentionReason["code"], LucideIcon> = {
  ci_failed: XCircle,
  changes_requested: FileEdit,
  conflict: Swords,
  review_requested: Eye,
  new_reply: MessageSquareReply,
  mention: AtSign,
  unresolved_threads: MessagesSquare,
  overdue: AlertTriangle,
  due_soon: AlarmClock,
  reminder: BellRing,
  stale_ping: Hourglass,
  approved_unmerged: CheckCircle2,
};

export function ReasonChip({
  reason,
  size = "sm",
}: {
  reason: AttentionReason;
  size?: "xs" | "sm";
}) {
  const m = REASON_META[reason.code];
  const label = reason.code === "new_reply" || reason.code === "mention" ? m.short : reason.label;
  return (
    <Chip
      tone={m.tone}
      icon={REASON_ICONS[reason.code]}
      size={size}
      title={reason.actor ? `${reason.label} · @${reason.actor}` : reason.label}
    >
      {label}
    </Chip>
  );
}

export function KindIcon({
  kind,
  state,
  isDraft,
  className,
}: {
  kind: ItemKind;
  state: ItemState;
  isDraft?: boolean;
  className?: string;
}) {
  let Icon: LucideIcon = CircleDot;
  let tone: Tone = "info";
  let label = "Open issue";
  if (kind === "pr") {
    if (state === "merged") [Icon, tone, label] = [GitMerge, "success", "Merged pull request"];
    else if (state === "closed")
      [Icon, tone, label] = [GitPullRequestClosed, "neutral", "Closed pull request"];
    else if (isDraft) [Icon, tone, label] = [GitPullRequestDraft, "neutral", "Draft pull request"];
    else [Icon, tone, label] = [GitPullRequest, "info", "Open pull request"];
  } else if (kind === "discussion") {
    [Icon, tone, label] = [
      MessageCircle,
      state === "open" ? "info" : "neutral",
      state === "open" ? "Open discussion" : "Closed discussion",
    ];
  } else if (state === "closed") [Icon, tone, label] = [CheckCircle2, "neutral", "Closed issue"];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0", TONE_CLASSES[tone].text, className)}
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

const REVIEW_TONE: Record<string, Tone> = {
  APPROVED: "success",
  CHANGES_REQUESTED: "danger",
  COMMENTED: "info",
  REQUESTED: "warning",
  DISMISSED: "neutral",
};
const REVIEW_LABEL: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "commented",
  REQUESTED: "review pending",
  DISMISSED: "review dismissed",
};

export function Avatar({
  login,
  src,
  size = 24,
  className,
}: {
  login: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const url = !failed
    ? (src ??
      (login && !login.includes("[")
        ? `https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=${size * 2}`
        : null))
    : null;
  const hue = [...login].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("bg-surface-3 shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${hue} 32% 46%)`,
      }}
    >
      {login.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Reviewer avatars with a ring showing their review state (+ text alternative). */
export function ReviewerStack({
  reviewers,
  max = 4,
  size = 22,
}: {
  reviewers: { login: string; avatarUrl: string | null; state: string }[];
  max?: number;
  size?: number;
}) {
  if (!reviewers.length) return null;
  const shown = reviewers.slice(0, max);
  return (
    <div
      className="flex items-center -space-x-1.5"
      aria-label={reviewers
        .map((r) => `@${r.login} ${REVIEW_LABEL[r.state] ?? r.state}`)
        .join(", ")}
      role="img"
    >
      {shown.map((r) => (
        <Tooltip
          key={r.login}
          content={`@${r.login} — ${REVIEW_LABEL[r.state] ?? r.state.toLowerCase()}`}
        >
          <span
            className={cn(
              "ring-offset-surface-1 rounded-full ring-2 ring-offset-1",
              TONE_CLASSES[REVIEW_TONE[r.state] ?? "neutral"].ring,
            )}
          >
            <Avatar login={r.login} src={r.avatarUrl} size={size} />
          </span>
        </Tooltip>
      ))}
      {reviewers.length > max ? (
        <span className="text-ink-subtle pl-2.5 font-mono text-[11px]">
          +{reviewers.length - max}
        </span>
      ) : null}
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const tone: Tone =
    priority === "P0"
      ? "danger"
      : priority === "P1"
        ? "attention"
        : priority === "P2"
          ? "info"
          : "neutral";
  return (
    <Chip tone={tone} size="xs" className="font-mono" title={`Priority ${priority}`}>
      {priority}
    </Chip>
  );
}

export function LabelPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="border-line text-ink-muted inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px]">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: `#${color.replace("#", "")}` }}
      />
      {name}
    </span>
  );
}

export function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="bg-surface-2 text-ink-muted inline-flex h-6 items-center gap-1 rounded-md px-2 font-mono text-[11.5px]">
      #{tag}
      {onRemove ? (
        <button
          onClick={onRemove}
          aria-label={`Remove tag ${tag}`}
          className="text-ink-subtle hover:text-ink rounded"
        >
          <XCircle className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export { Ban };
