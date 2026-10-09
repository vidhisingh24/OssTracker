"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ItemDetailView } from "@/components/items/item-detail";

export function ItemPage({ id }: { id: string }) {
  return (
    <div>
      <Link
        href="/items"
        className="text-ink-muted hover:text-ink mb-4 inline-flex items-center gap-1.5 text-[13px]"
      >
        <ArrowLeft className="size-4" /> All items
      </Link>
      <ItemDetailView id={id} variant="page" />
    </div>
  );
}
