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
