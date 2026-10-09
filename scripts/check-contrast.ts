/**
 * Verifies WCAG AA contrast (4.5:1 for text, 3:1 for large text / UI marks) for every
 * documented foreground/background token pair, in both themes. Runs in CI.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(
  resolve(import.meta.dirname, "../apps/web/src/styles/globals.css"),
  "utf8",
);

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

type Pair = [fg: string, bg: string, min: number];
const surfaces = ["bg", "surface-1", "surface-2"];
const pairs: Pair[] = [
  ...surfaces.flatMap((s): Pair[] => [
    ["ink", s, 4.5],
    ["ink-muted", s, 4.5],
    ["ink-subtle", s, 4.5],
    ["accent-fg", s, 4.5],
  ]),
  ["ink", "surface-3", 4.5],
  ["ink-muted", "surface-3", 4.5],
  ["accent-ink", "accent", 4.5],
  ["accent-ink", "accent-hover", 4.5],
  ["ink-inverse", "ink", 4.5],
  ...["attention", "info", "success", "danger", "warning", "neutral"].flatMap((t): Pair[] => [
    [`tone-${t}-fg`, `tone-${t}-bg`, 4.5],
    [`tone-${t}-fg`, "surface-1", 4.5],
    [`tone-${t}-fg`, "bg", 4.5],
    [`tone-${t}-solid`, "surface-1", t === "neutral" ? 1.9 : 2.4],
  ]),
  ["ring", "bg", 2.4],
];

let failures = 0;
for (const [name, theme] of [
  ["light", light],
  ["dark", dark],
] as const) {
  for (const [fg, bg, min] of pairs) {
    const a = theme[fg];
    const b = theme[bg];
    if (!a?.startsWith("#") || !b?.startsWith("#")) {
      console.error(`✗ [${name}] ${fg} on ${bg}: missing or non-hex token`);
      failures++;
      continue;
    }
    const ratio = contrast(a, b);
    const ok = ratio >= min;
    if (!ok) failures++;
    const line = `${ok ? "✓" : "✗"} [${name}] ${fg} (${a}) on ${bg} (${b}): ${ratio.toFixed(2)} (min ${min})`;
    if (ok) console.log(line);
    else console.error(line);
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast check(s) failed.`);
  process.exit(1);
}
console.log("\nAll contrast checks passed.");
