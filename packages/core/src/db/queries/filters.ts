import { z } from "zod";
import { BALLS, CI_STATES, ITEM_KINDS, ITEM_STATES, PRIORITIES, STAGES } from "../../types";

const list = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    if (Array.isArray(v)) return v.flatMap((x) => String(x).split(",")).filter(Boolean);
    return String(v).split(",").filter(Boolean);
  }, z.array(inner).optional());

export const ITEM_SORTS = [
  "attention",
  "updated",
  "created",
  "repo",
  "title",
  "priority",
  "stage",
  "activity",
] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export const itemFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: list(z.enum(ITEM_KINDS)),
  state: list(z.enum(ITEM_STATES)),
  stage: list(z.enum(STAGES)),
  ball: list(z.enum(BALLS)),
  ci: list(z.enum(CI_STATES)),
  priority: list(z.enum(PRIORITIES)),
  repo: list(z.string().max(200)),
  label: list(z.string().max(100)),
  tag: list(z.string().max(60)),
  relation: list(z.string().max(40)),
  source: list(z.enum(["github", "manual", "planned"])),
  program: z.string().max(100).optional(),
  archived: z.enum(["exclude", "only", "include"]).default("exclude"),
  sort: z.enum(ITEM_SORTS).default("updated"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50),
});
export type ItemFilter = z.infer<typeof itemFilterSchema>;
export type ItemFilterInput = z.input<typeof itemFilterSchema>;

export function parseItemFilter(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ItemFilter {
  const obj: Record<string, unknown> = {};
  if (params instanceof URLSearchParams) {
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key);
      obj[key] = all.length > 1 ? all : all[0];
    }
  } else Object.assign(obj, params);
  const parsed = itemFilterSchema.safeParse(obj);
  return parsed.success ? parsed.data : itemFilterSchema.parse({});
}

/** Serialize a filter back to a compact query string (defaults omitted). */
export function filterToQuery(f: Partial<ItemFilter>): string {
  const defaults = itemFilterSchema.parse({});
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else if (v !== (defaults as Record<string, unknown>)[k] && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}
