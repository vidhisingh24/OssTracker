# Design system

Warm, calm, editorial. Tokens live in `apps/web/src/styles/globals.css` (light `:root`, dark `.dark`), mapped into Tailwind via `@theme inline`. `pnpm check:contrast` verifies WCAG AA for every documented text pair in CI.

## Palette

| Role                                 | Light                             | Dark                              | Notes                                      |
| ------------------------------------ | --------------------------------- | --------------------------------- | ------------------------------------------ |
| Background                           | Ivory `#faf9f5`                   | Slate `#141413`                   |                                            |
| Surface 1 / 2 / 3                    | `#fffefb` / `#f3f1ea` / `#e8e6dc` | `#1c1b19` / `#262522` / `#302f2b` | warm-black elevation scale                 |
| Ink / muted / subtle                 | `#141413` / `#57564f` / `#6e6c65` | `#faf9f5` / `#b0aea5` / `#96948b` |                                            |
| Accent (Clay)                        | `#d97757`, text `#a24a2c`         | `#d97757`, text `#e9a07f`         | primary buttons: Slate ink on Clay (6.6:1) |
| Info / open / in review (Dusty Blue) | `#6a9bcc`, text `#335f8a`         | text `#9cc0e3`                    |                                            |
| Success / merged / passing (Sage)    | `#788c5d`, text `#4d5f35`         | text `#adc28e`                    |                                            |
| Danger / failing / changes requested | `#b5412f`, text `#9f3524`         | `#e0533f`, text `#ff8b7b`         | deeper/redder than Clay                    |
| Warning / pending / stale (Amber)    | `#c98a1b`, text `#7c5309`         | text `#e8b85c`                    |                                            |
| Neutral / closed (Cloud)             | `#b0aea5`                         | `#8d8b83`                         |                                            |

Every tone has `solid` (dots, icons, chart marks), `fg` (text) and `bg` (tinted chip) tokens. Status is never color-only: chips always carry an icon and a label; review rings on avatars have tooltips and an aria-label.

## Type

Poppins (UI, titles ≥ 600), Lora (notes, descriptions, empty states), JetBrains Mono (numbers, slugs, PR numbers, code) — self-hosted woff2 via `next/font/local`, tabular numerals for stats. Fallbacks Arial / Georgia / system mono.

## Shape & motion

8-pt grid, radii 8/12/16 px, 1px hairline borders at low opacity, soft warm shadows, grain + gradient only on hero surfaces. Motion 150–220 ms ease-out (`cubic-bezier(.22,1,.36,1)`); all animation disabled under `prefers-reduced-motion`. Focus rings in Clay.

## Brand

Wordmark "Contrib" in Poppins 600 with an original glyph: an open ring (a branch drawn as a "C") whose gap holds a commit node, on a Clay tile.

## Charts

Clay = primary series (merged), Dusty Blue = secondary (opened), Sage/Cloud for stacked states. Direct labels on bars, tooltips, no gridlines beyond faint horizontal guides, every chart has an aria-label text alternative.
