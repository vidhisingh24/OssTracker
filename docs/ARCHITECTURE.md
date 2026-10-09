# Architecture

```
                ┌──────────────────────── apps/web (Next.js App Router) ───────────────────────┐
 Browser ──────▶│ pages (client, TanStack Query) ──▶ /api/* route handlers ──▶ @contrib/core   │
                │ Auth.js (GitHub OAuth, JWT)       guard: session+allowlist, same-origin,    │
                │                                   JSON-only, rate limit, zod                 │
                └───────────────┬──────────────────────────────────────────────┬──────────────┘
                                │ enqueue (pg-boss)                            │ SQL (Drizzle)
                                ▼                                              ▼
                ┌──────────── apps/worker ─────────────┐              ┌──────────────────┐
                │ pg-boss consumers + cron schedules   │──── SQL ────▶│     Postgres      │
                │ sync.hot/warm/cold/item/notifications│              │ items, events,    │
                │ notify.dispatch/reminders/digest     │              │ user_meta, ...    │
                └──────────────┬───────────────────────┘              └──────────────────┘
                               │ GraphQL + REST (rate-limit aware)
                               ▼
                           GitHub API
```

`packages/core` holds everything shared: typed env, Drizzle schema + migrations, GitHub client, sync engine, derived intelligence (pure functions), queries, notifications, demo seed.

## Sync flow

1. **Discovery** (`sync/discovery.ts`, cold + incremental hot): GraphQL `search` for `author:`, `involves:`, `commenter:`, `reviewed-by:`, `review-requested:`, `assignee:`, `mentions:` (issues/PRs) and discussions. Each query runs over `updated:` date windows that are recursively halved until each holds < 1000 results (the search cap). Results are deduped and tagged with the relation that found them.
2. **Hydration** (`sync/engine.ts`): `nodes(ids:)` in batches of 20 with full PR/issue/discussion fragments (`github/queries.ts`): reviewDecision, reviewRequests, latestReviews + reviews, reviewThreads(isResolved), head commit `statusCheckRollup { state contexts { CheckRun | StatusContext } }`, mergeable, closingIssuesReferences / closedByPullRequestsReferences, last 30 comments, timeline items. Responses are validated with zod (`github/normalize.ts`) into an `ItemSnapshot`.
3. **Persist + diff** (`sync/persist.ts`): one transaction per item — upsert repo (handles renames/transfers), item, reviews, checks, comments, auto links; diff against the previous snapshot (`derive/diff.ts`) into append-only `item_events` with deterministic dedupe keys, so re-runs never duplicate. Missing nodes are marked `is_gone` (deleted/transferred/access lost).
4. **Derive** (`derive/derive.ts`, pure + unit-tested): CI rollup, stage, ball-in-court, attention reasons, staleness, next action. Manual-layer signals (due, reminder, priority, snooze) are applied at read time so they're always fresh.
5. **Notifications poll**: conditional `GET /notifications` with `If-Modified-Since`; the worker re-schedules itself after `X-Poll-Interval` seconds. Changed threads map to items (unknown ones resolved via `repository.issueOrPullRequest`) and get a targeted hydrate.
6. **Dispatch**: high-priority events → Email/Telegram/ntfy (quiet hours, daily digest), reminders → events.

Tiers (configurable in Settings): hot every 5 min (incremental discovery + open items), warm hourly (closed/merged in last 30 days), cold every 6 h (full discovery + reconcile), notifications per `X-Poll-Interval`.

Resilience: exponential backoff with jitter, `Retry-After`/reset handling for secondary limits, per-request timeouts, rate floor (`RateLimitLowError`), partial-failure tolerance (errors collected per item/query → run status `partial`), pino structured logs with token redaction, `sync_runs` audit with cost and errors.

## Data model

See `packages/core/src/db/schema.ts`. GitHub rows are keyed by node id; upserts are idempotent. `user_meta` and `repo_meta` hold everything typed by the user and are never written by sync.
