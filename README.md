# Zivilisation 1 — Browser Game

A modern, faithful browser-based recreation of Sid Meier's Civilization I (1991),
built with React, Vite, Zustand, and Bootstrap. Explore, build, and conquer from
4000 BC to 2100 AD.

> Full gameplay and architecture documentation lives in
> [README.adoc](./README.adoc) and [GAMEPLAY.md](./GAMEPLAY.md).

## Getting Started

```bash
npm install
npm run dev     # starts the dev server at http://localhost:3000
```

## Testing

The project uses **Playwright** for end-to-end tests and **Vitest** for unit
tests (`npm test`).

### Install Playwright

Playwright is already a dev dependency. The browser binaries must be installed
once on each machine:

```bash
npm install
npx playwright install chromium   # only Chromium is used by this project
```

### Run the e2e tests

```bash
# Playwright starts the dev server automatically (see webServer in
# playwright.config.ts), so a plain run is enough:
npm test:e2e                      # alias for `npx playwright test`
```

Useful variations:

```bash
npx playwright test --headed                  # watch tests in a visible browser
npx playwright test --ui                      # interactive UI mode with live debugging
npx playwright test --debug                   # step through tests with the inspector
npx playwright test e2e/setup                 # only the core setup/connectivity tests
npx playwright test -g "End Turn"             # run tests matching a title
npx playwright test --project=chromium        # run a specific project
npx playwright show-report                    # view the last HTML report
```

### How the suite is organised

```
e2e/
├── global-setup.ts            # HTTP connectivity pre-check (fail-fast guard)
├── setup/
│   └── app-setup.spec.ts      # CORE SETUP — app is running & landing page loads
└── game.spec.ts               # feature tests + shared helpers (startGame, endTurn, …)
```

### Fail-fast strategy

The suite is deliberately fail-fast — if the application is unreachable or the
core landing page is broken, **no feature test runs**:

1. **`e2e/global-setup.ts`** performs a lightweight HTTP check against
   `http://localhost:3000` before anything else. If the server is unreachable it
   throws, aborting the entire run immediately.
2. **The `setup` project** (`e2e/setup/app-setup.spec.ts`) runs first and verifies
   that the app responds, mounts, and renders the game shell. The `chromium`
   project declares a dependency on it, so a failed setup test skips the whole
   feature suite.
3. **`maxFailures: 1`** in `playwright.config.ts` stops the run after the first
   failure anywhere.

### Configuration

`playwright.config.ts` pins `baseURL` to `http://localhost:3000` (matching
`vite.config.js`) and can auto-start the dev server via its `webServer` block,
so `npx playwright test` works without manually starting anything.

### CI/CD

`.github/workflows/playwright.yml` runs the full e2e suite on GitHub Actions for
**every pull request** (and on pushes to `main`/`master`). The HTML report and
test artifacts are uploaded as workflow artifacts.

### Writing tests

Follow the Playwright guidelines in
[.github/copilot-instructions.md](./.github/copilot-instructions.md): shared
helpers, fail-fast setup first, and one `describe` block per feature area.
