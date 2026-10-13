"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useSyncStatus } from "@/lib/api";
import { relative } from "@/lib/format";

export function SyncFailureBanner() {
  const { data } = useSyncStatus();
  if (data?.needsReconnect) {
    return (
      <div role="alert" className="border-danger/25 bg-danger-bg border-b">
        <div className="text-danger-fg mx-auto flex max-w-[1320px] flex-wrap items-center gap-2 px-4 py-2 text-[13px] sm:px-6 lg:px-10">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            GitHub access was revoked or expired, so syncing has stopped. Sign in again to
            reconnect.
          </span>
          <Link href="/login?reconnect=1" className="font-semibold underline underline-offset-2">
            Reconnect GitHub
          </Link>
        </div>
      </div>
    );
  }
  if (!data?.lastFailure || data.running.length) return null;
  return (
    <div role="alert" className="border-danger/25 bg-danger-bg border-b">
      <div className="text-danger-fg mx-auto flex max-w-[1320px] items-center gap-2 px-4 py-2 text-[13px] sm:px-6 lg:px-10">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          Sync failed {relative(data.lastFailure.at)}: {data.lastFailure.error ?? "unknown error"}
        </span>
        <Link href="/sync" className="font-medium underline underline-offset-2">
          View log
        </Link>
      </div>
    </div>
  );
}
