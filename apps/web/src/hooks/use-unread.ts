"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson, keys } from "@/lib/api";

export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: keys.unread,
    queryFn: () => fetchJson<{ unread: number }>("/api/inbox?count=1"),
    refetchInterval: 60_000,
  });
  return data?.unread ?? 0;
}
