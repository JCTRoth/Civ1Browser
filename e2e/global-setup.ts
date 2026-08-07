import type { FullConfig } from '@playwright/test';

/**
 * Global pre-flight connectivity check (fail-fast guard).
 *
 * Runs ONCE, before ALL tests (including the `setup` project). If the
 * application cannot be reached we throw immediately, which aborts the entire
 * test run. Feature tests are never attempted against a dead server.
 *
 * The `webServer` entry in `playwright.config.ts` normally starts the dev
 * server first; this check is an explicit second guard that produces a clear
 * error message and stops the run without launching a single browser.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const timeoutMs = Number(process.env.PLAYWRIGHT_SETUP_TIMEOUT ?? 20_000);
  await assertServerReachable(baseURL, timeoutMs);
}

async function assertServerReachable(baseURL: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL, { method: 'GET' });
      // Any HTTP response (2xx–4xx) means something is serving the app.
      if (response.status >= 200 && response.status < 500) {
        console.log(`[global-setup] Application reachable at ${baseURL} (HTTP ${response.status}).`);
        return;
      }
      lastError = new Error(`Server responded with unexpected status ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(1_000);
  }

  throw new Error(
    `[FAIL-FAST] Application is unreachable at ${baseURL}.\n` +
      `The Playwright suite cannot continue: the app must be running and serving the landing page.\n` +
      `Start it with "npm run dev" (or let the Playwright webServer start it) and re-run the tests.\n` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
