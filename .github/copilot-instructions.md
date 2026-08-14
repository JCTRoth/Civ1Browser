When ever possible use specific types instead of 'any'
Put interfaces and types in the `types/` folder, and import them from there
Always define function parameter with types and return types
Keep TSX components purely presentational (JSX only)
Move CSS → src/styles, static data → src/data, utility functions → src/utils, tests -> __tests__
Assume npm server is already running at port 3000
You are running on a Ubuntu/Fedora system all command are availablell, install what is missing if needed

## Playwright E2E Test Guidelines

### Fail-fast setup (MANDATORY — never bypass)
The e2e suite is built around a strict fail-fast strategy:
- `e2e/global-setup.ts` pre-checks HTTP connectivity to `http://localhost:3000`.
  If the app is unreachable it throws, and the whole run aborts before any browser launches.
- `e2e/setup/app-setup.spec.ts` is the CORE SETUP spec. It verifies the app responds,
  mounts, and that the landing page renders. It runs first in its own `setup` project,
  and the `chromium` project declares a dependency on it — a failed setup test skips ALL feature tests.
- `maxFailures: 1` is set in `playwright.config.ts` — the run stops after the first failure anywhere.

Never reorder, rename, or disable the setup spec or the setup project, and never commit `test.only`.
New feature tests must NOT re-check connectivity on their own; they rely on the setup gate.

### File & folder organisation
- Keep Playwright specs under `e2e/`. Do not scatter them elsewhere.
- Shared helpers (game startup, turn advancement, dialog dismissal, top-menu/side-panel
  openers) are defined at the top of `e2e/game.spec.ts`. Reuse them — never copy-paste
  helper logic into new specs.
- Core/connectivity checks go in `e2e/setup/app-setup.spec.ts`. Feature tests go in dedicated spec
  files (e.g. `e2e/city.spec.ts`, `e2e/diplomacy.spec.ts`) with one `describe` block per feature area.

### Writing good tests
- Always start games with `startGame(page)` using the smallest map preset (`CLOSEUP_1V1`) for speed.
- Prefer accessible selectors (roles, labels, text) over CSS classes; use `.locator('.class')` only
  when no semantic hook exists.
- Keep tests independent: each test starts a fresh game; never share mutable state between tests.
- Use explicit timeouts on slow async UI (e.g. AI turn processing) and `page.on('pageerror')`
  to fail on uncaught exceptions when relevant.
- After changing a spec, run `npx playwright test e2e/setup` first, then the affected feature spec,
  then the full suite.