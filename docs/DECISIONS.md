# Decisions

One line each: decision — why.

## Tooling & stack

- Pinned majors with known-stable APIs (Next 15.5, React 19.1, Tailwind 4.1, Drizzle 0.44, zod 4.1, TanStack Table 8, Vitest 3, msw 2, ESLint 9, TypeScript 5.9, pg-boss 10) instead of the newest majors — the newest (TS 7, Vitest 5, msw 3, Table 9, pg-boss 12) were released recently and their breaking changes would add risk without user-visible benefit.
- Auth.js v5 (`next-auth@5` beta) with JWT sessions and no DB adapter — single user, we only need the GitHub token, which we store ourselves encrypted.
- `@contrib/core` is consumed as TypeScript source (Next `transpilePackages`, worker via `tsx`) — no build step for the shared package, one source of truth, faster iteration.
- Root `package.json` is ESM (`"type": "module"`) — scripts use `import.meta`.
- pnpm 11 `allowBuilds` whitelist for postinstall scripts — pnpm blocks lifecycle scripts by default.
- Repo-local git identity `Vidhi Singh <vidhiisingh2403@gmail.com>`; `core.autocrlf=false` + `.gitattributes eol=lf` — consistent line endings from Windows.

## Design

- Primary buttons use Slate ink (#141413) on Clay (#d97757), not white — white on Clay is ~3:1 and fails AA for 13–14px labels; ink on Clay is ~6.6:1.
- Text uses darker "-fg" variants of each brand color (e.g. Clay text #a24a2c on light) while brand hexes stay for fills, dots and chart marks — brand colors at their exact value fail 4.5:1 as body text on Ivory.
- Tone backgrounds are explicit hex (no `color-mix`) — the contrast script in CI can parse and verify every pair.
- Fonts self-hosted via `next/font/local` from Fontsource latin subsets committed in `apps/web/src/fonts` — no runtime CDN, builds work offline.
- Theme handled by `next-themes` (class strategy, default `system`) — avoids flash of wrong theme and handles the system listener.
- CSP allows `'unsafe-inline'` scripts — Next.js App Router injects inline bootstrap scripts; nonce-based CSP would force every page dynamic and complicate caching for a single-user app.

## Data & sync

- Postgres for web + worker (docker compose, port 5433 locally); embedded PGlite kept for tests/CLI only — PGlite's wasm loader breaks inside Next.js's server runtime (URL realm mismatch), and one real DB matches production.
- Separate `user_meta` / `repo_meta` tables instead of manual columns on `items`/`repos` — makes "sync never overwrites manual data" structural, not a convention.
- Planned items are rows in `items` with `source = planned` (and a `repo:<slug>` placeholder repo when unknown) — one list/filter/table code path for everything.
- `nodes(ids:)` batches of 20 for hydration instead of aliased queries — same cost, simpler parsing; null entries mark gone items.
- Attention: GitHub-derived reasons stored at sync time; due/reminder/priority/snooze applied at read time (pure `computeAttention`) so time-based signals never go stale.
- "Ping suggestions" and "approved, awaiting merge" are informational: they show in Waiting, not in Needs-you.
- First import marks events read and undispatched-as-sent, so connecting GitHub doesn't flood the inbox or phone.
- Event dedupe keys are derived deterministically from the diff (comment/review ids, head sha), stored with a unique index → idempotent re-runs.
- Notifications poll self-reschedules via pg-boss `startAfter = X-Poll-Interval` (min 60 s) rather than a fixed cron.
- Live progress via short polling of `sync_runs.progress` (1.2 s while running) instead of SSE — simpler behind proxies, negligible cost for one user.
- Sync-now from the web enqueues pg-boss jobs; the worker does all GitHub work. First OAuth sign-in wipes demo data and enqueues a cold sync.

## Web & security

- All pages are client components over JSON route handlers + TanStack Query — gives optimistic updates, skeletons and URL-persisted filters with one pattern.
- CSRF: mutations require same-origin (`Origin`/`Sec-Fetch-Site`) and `application/json`, on top of SameSite=Lax httpOnly Auth.js cookies.
- Per-route in-memory rate limiting on mutations — single process, single user; no Redis needed.
- Item drawer is driven by `?item=<id>` so it survives reloads, back button and deep links; full page at `/items/<id>`.
- Worker runs TypeScript via `tsx` in Docker (no separate build) — simpler, fine for a single long-running process.
- Fonts subset to Latin.
- Insights charts: Recharts for bar charts, hand-drawn SVG for the heatmap (no extra dependency, exact token colors).
